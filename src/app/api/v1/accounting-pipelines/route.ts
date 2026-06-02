import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import type { Prisma } from '@prisma/client';
import { ApiError, handleApiError } from '@/lib/error-handler';
import { formatAccountingPipeline } from '@/lib/format-accounting-pipeline';
import { parseSortParams } from '@/lib/sort-helper';

// ソート許可フィールド → Prisma orderBy 変換マップ
// リレーション越しのフィールド（MO番号・顧客名・代理店名）はネスト orderBy に変換する
const PIPELINE_ORDER_BY_MAP: Record<
  string,
  (dir: 'asc' | 'desc') => Prisma.AccountingPipelineOrderByWithRelationInput
> = {
  'project.projectNo': (dir) => ({ project: { projectNo: dir } }),
  'project.customerName': (dir) => ({ project: { customer: { customerName: dir } } }),
  'project.partnerName': (dir) => ({ project: { partner: { partnerName: dir } } }),
  revenueType: (dir) => ({ revenueType: dir }),
  unitPrice: (dir) => ({ unitPrice: dir }),
  quantity: (dir) => ({ quantity: dir }),
  totalAmount: (dir) => ({ totalAmount: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
  updatedAt: (dir) => ({ updatedAt: dir }),
};

const DEFAULT_PIPELINE_ORDER_BY: Prisma.AccountingPipelineOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
];

const PIPELINE_INCLUDE = {
  project: {
    select: {
      id: true,
      projectNo: true,
      projectSalesStatus: true,
      customer: { select: { id: true, customerName: true } },
      partner: { select: { id: true, partnerName: true } },
    },
  },
  business: { select: { id: true, businessName: true } },
  entries: {
    orderBy: { entryDate: 'desc' as const },
    include: {
      distributions: {
        orderBy: { tier: 'asc' as const },
        include: {
          partner: { select: { id: true, partnerCode: true, partnerName: true } },
        },
      },
    },
  },
} as const;

// GET: パイプライン一覧
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)));
    const businessIdParam = searchParams.get('businessId');
    const revenueTypeParam = searchParams.get('revenueType');
    const search = searchParams.get('search')?.trim();

    // ソート（複数列対応）。許可フィールドのみ Prisma orderBy に変換し、無効時はデフォルト
    const sortItems = parseSortParams(searchParams, 'createdAt', 'desc');
    const mappedOrderBy = sortItems
      .map((item) => PIPELINE_ORDER_BY_MAP[item.field]?.(item.direction))
      .filter((o): o is Prisma.AccountingPipelineOrderByWithRelationInput => Boolean(o));
    const orderBy = mappedOrderBy.length > 0 ? mappedOrderBy : DEFAULT_PIPELINE_ORDER_BY;

    const where: Record<string, unknown> = { pipelineIsActive: true };

    if (businessIdParam) {
      where.businessId = parseInt(businessIdParam, 10);
    } else if (user.role === 'staff') {
      const assignments = await prisma.userBusinessAssignment.findMany({
        where: { userId: user.id },
        select: { businessId: true },
      });
      where.businessId = { in: assignments.map((a) => a.businessId) };
    }

    if (revenueTypeParam && ['SHOT', 'STOCK'].includes(revenueTypeParam)) {
      where.revenueType = revenueTypeParam;
    }

    if (search) {
      where.OR = [
        { project: { projectNo: { contains: search, mode: 'insensitive' } } },
        { project: { customer: { customerName: { contains: search, mode: 'insensitive' } } } },
        { project: { partner: { partnerName: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [total, pipelines] = await Promise.all([
      prisma.accountingPipeline.count({ where }),
      prisma.accountingPipeline.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: PIPELINE_INCLUDE,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: pipelines.map(formatAccountingPipeline),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: パイプライン作成
const createPipelineSchema = z.object({
  projectId: z.number().int().positive('案件を選択してください'),
  revenueType: z.enum(['SHOT', 'STOCK'], { required_error: '報酬タイプを選択してください' }),
  unitPrice: z.number().positive('単価は0より大きい値を入力してください'),
  quantity: z.number().int().min(1, '個数は1以上を入力してください').default(1),
  billingCycle: z.string().max(50).nullable().optional(),
  paymentMethod: z.string().max(100).nullable().optional(),
  operationStartDate: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const data = createPipelineSchema.parse(body);

    // 案件の存在確認・事業ID取得
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, projectIsActive: true },
      select: { id: true, businessId: true, projectNo: true },
    });
    if (!project) throw ApiError.badRequest('指定された案件が見つかりません');

    // 重複チェック
    const existing = await prisma.accountingPipeline.findUnique({
      where: {
        projectId_businessId: {
          projectId: project.id,
          businessId: project.businessId,
        },
      },
    });
    if (existing) throw ApiError.badRequest('この案件には既にパイプラインが作成されています');

    const totalAmount = data.unitPrice * data.quantity;

    const pipeline = await prisma.accountingPipeline.create({
      data: {
        projectId: project.id,
        businessId: project.businessId,
        revenueType: data.revenueType,
        unitPrice: data.unitPrice,
        quantity: data.quantity,
        totalAmount,
        billingCycle: data.billingCycle ?? null,
        paymentMethod: data.paymentMethod ?? null,
        operationStartDate: data.operationStartDate ? new Date(data.operationStartDate) : null,
        memo: data.memo ?? null,
        createdBy: user.id,
        updatedBy: user.id,
      },
      include: PIPELINE_INCLUDE,
    });

    return NextResponse.json(
      { success: true, data: formatAccountingPipeline(pipeline) },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
