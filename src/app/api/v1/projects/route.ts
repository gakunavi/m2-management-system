import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  parseSortParams,
  buildOrderBy,
  getCustomSortPagination,
  applyAppSortAndSlice,
} from '@/lib/sort-helper';
import { formatProject } from '@/lib/format-project';
import { generateProjectNo, createInitialMovements } from '@/lib/project-helpers';
import { getBusinessPartnerScope } from '@/lib/revenue-helpers';

const PROJECT_SORT_FIELDS = [
  'projectNo',
  'projectSalesStatus',
  'projectExpectedCloseMonth',
  'projectAssignedUserName',
  'updatedAt',
  'createdAt',
] as const;

const createProjectSchema = z.object({
  businessId: z.number().int().positive('事業を選択してください'),
  customerId: z.number().int().positive('顧客を選択してください'),
  partnerId: z.number().int().positive().optional().nullable(),
  projectSalesStatus: z.string().min(1, '営業ステータスを選択してください'),
  projectExpectedCloseMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM形式で入力してください')
    .optional()
    .nullable()
    .or(z.literal('')),
  projectAssignedUserId: z.number().int().positive().optional().nullable(),
  projectAssignedUserName: z.string().max(100).optional().nullable().or(z.literal('')),
  projectNotes: z.string().max(2000).optional().nullable().or(z.literal('')),
  projectRenovationNumber: z.string().max(100).optional().nullable().or(z.literal('')),
  projectCustomData: z.record(z.unknown()).optional().default({}),
});

const PROJECT_INCLUDE = {
  customer: { select: { id: true, customerCode: true, customerName: true, customerFolderUrl: true } },
  partner: { select: { id: true, partnerCode: true, partnerName: true, partnerFolderUrl: true } },
  business: { select: { id: true, businessName: true } },
  assignedUser: { select: { id: true, userName: true } },
} as const;

// ============================================
// GET /api/v1/projects
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number };
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)));
    const search = searchParams.get('search') ?? '';
    const businessIdParam = searchParams.get('businessId');
    const sortItems = parseSortParams(searchParams, 'updatedAt', 'desc');

    // フィルター
    const statusFilter = searchParams.get('filter[projectSalesStatus]');
    const assignedUserFilter = searchParams.get('filter[projectAssignedUserId]');
    const isActiveParam = searchParams.get('filter[isActive]');
    const customerIdParam = searchParams.get('filter[customerId]') || searchParams.get('customerId');
    const partnerIdParam = searchParams.get('filter[partnerId]') || searchParams.get('partnerId');

    const where: Record<string, unknown> = {
      projectIsActive: isActiveParam === 'false' ? false : true,
    };

    // 顧客フィルター（関連案件タブ用）
    if (customerIdParam) {
      where.customerId = parseInt(customerIdParam, 10);
    }

    // 代理店フィルター（関連案件タブ用）
    if (partnerIdParam) {
      where.partnerId = parseInt(partnerIdParam, 10);
    }

    // 事業フィルター
    if (businessIdParam) {
      where.businessId = parseInt(businessIdParam, 10);
    } else if (user.role === 'staff') {
      // staffは自分がアサインされた事業のみ
      const assignments = await prisma.userBusinessAssignment.findMany({
        where: { userId: user.id },
        select: { businessId: true },
      });
      where.businessId = { in: assignments.map((a) => a.businessId) };
    } else if (user.role === 'partner_admin') {
      if (user.partnerId) {
        const businessIdForScope = businessIdParam ? parseInt(businessIdParam, 10) : undefined;
        const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessIdForScope);
        where.partnerId = { in: partnerIds };
      }
    } else if (user.role === 'partner_staff') {
      where.projectAssignedUserId = user.id;
    }

    // テキスト検索
    if (search) {
      where.OR = [
        { projectNo: { contains: search, mode: 'insensitive' } },
        { customer: { customerName: { contains: search, mode: 'insensitive' } } },
        { partner: { partnerName: { contains: search, mode: 'insensitive' } } },
        { projectAssignedUserName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // ステータスフィルター
    if (statusFilter) {
      const statuses = statusFilter.split(',').filter(Boolean);
      if (statuses.length > 0) {
        where.projectSalesStatus = { in: statuses };
      }
    }

    // 担当者フィルター
    if (assignedUserFilter) {
      where.projectAssignedUserId = parseInt(assignedUserFilter, 10);
    }

    const defaultSort = [{ field: 'updatedAt' as const, direction: 'desc' as const }];
    const orderBy = buildOrderBy(sortItems, PROJECT_SORT_FIELDS, defaultSort);
    const originalSkip = (page - 1) * pageSize;
    const { skip, take, needsAppSort } = getCustomSortPagination(sortItems, originalSkip, pageSize);

    const [total, allProjects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : undefined,
        skip,
        take,
        include: PROJECT_INCLUDE,
      }),
    ]);

    // カスタムフィールドソート時はアプリ側でソート＆スライス
    const projects = needsAppSort
      ? applyAppSortAndSlice(
          allProjects,
          sortItems,
          (p) => p.projectCustomData as Record<string, unknown> | null,
          originalSkip,
          pageSize,
        )
      : allProjects;

    // ステータスラベル・色を一括取得してマッピング
    const statusCodes = Array.from(new Set(projects.map((p) => p.projectSalesStatus)));
    const statusDefs = statusCodes.length > 0
      ? await prisma.businessStatusDefinition.findMany({
          where: { statusCode: { in: statusCodes }, statusIsActive: true },
          select: { businessId: true, statusCode: true, statusLabel: true, statusColor: true },
        })
      : [];
    const statusMap = new Map(
      statusDefs.map((s) => [`${s.businessId}:${s.statusCode}`, { label: s.statusLabel, color: s.statusColor }]),
    );

    return NextResponse.json({
      success: true,
      data: projects.map((p) => {
        const formatted = formatProject(p);
        const status = statusMap.get(`${p.businessId}:${p.projectSalesStatus}`);
        return {
          ...formatted,
          projectSalesStatusLabel: status?.label ?? null,
          projectSalesStatusColor: status?.color ?? null,
        };
      }),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/projects
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const data = createProjectSchema.parse(body);

    // 事業の存在確認
    const business = await prisma.business.findFirst({
      where: { id: data.businessId, businessIsActive: true },
    });
    if (!business) throw ApiError.badRequest('指定された事業が見つかりません');

    // 顧客の存在確認
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, customerIsActive: true },
    });
    if (!customer) throw ApiError.badRequest('指定された顧客が見つかりません');

    // 代理店の存在確認（指定時のみ）
    if (data.partnerId) {
      const partner = await prisma.partner.findFirst({
        where: { id: data.partnerId, partnerIsActive: true },
      });
      if (!partner) throw ApiError.badRequest('指定された代理店が見つかりません');
    }

    // 営業ステータスの確認
    const statusDef = await prisma.businessStatusDefinition.findFirst({
      where: { businessId: data.businessId, statusCode: data.projectSalesStatus, statusIsActive: true },
    });
    if (!statusDef) throw ApiError.badRequest('指定された営業ステータスが見つかりません');

    // トランザクションで採番 + 作成 + ムーブメント生成
    const project = await prisma.$transaction(async (tx) => {
      const projectNo = await generateProjectNo(tx, data.businessId);

      const created = await tx.project.create({
        data: {
          businessId: data.businessId,
          customerId: data.customerId,
          partnerId: data.partnerId ?? null,
          projectNo,
          projectSalesStatus: data.projectSalesStatus,
          projectStatusChangedAt: new Date(),
          projectExpectedCloseMonth: data.projectExpectedCloseMonth || null,
          projectAssignedUserId: data.projectAssignedUserId ?? null,
          projectAssignedUserName: data.projectAssignedUserName || null,
          projectNotes: data.projectNotes || null,
          projectCustomData: (data.projectCustomData as object) ?? {},
          createdBy: user.id,
          updatedBy: user.id,
        },
        include: PROJECT_INCLUDE,
      });

      await createInitialMovements(tx, created.id, data.businessId);

      // 顧客×事業リンクを自動作成（未存在の場合のみ）
      await tx.customerBusinessLink.upsert({
        where: {
          customerId_businessId: {
            customerId: data.customerId,
            businessId: data.businessId,
          },
        },
        update: {},
        create: {
          customerId: data.customerId,
          businessId: data.businessId,
          linkStatus: 'active',
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: formatProject(project) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
