import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy, PARTNER_SORT_FIELDS } from '@/lib/sort-helper';
import { formatPartner } from '@/lib/format-partner';
import {
  whereIn,
  whereContains,
  whereDateRange,
  whereBoolean,
} from '@/lib/filter-helper';
import { generateTierNumber, validateTierHierarchy, calculateTierFromParent } from '@/lib/partner-hierarchy';

// ============================================
// 代理店コード採番ロジック
// ============================================

async function generatePartnerCode(): Promise<string> {
  const latest = await prisma.partner.findFirst({
    where: { partnerCode: { startsWith: 'AG-' } },
    orderBy: { partnerCode: 'desc' },
    select: { partnerCode: true },
  });
  if (!latest) return 'AG-0001';
  const num = parseInt(latest.partnerCode.replace('AG-', ''), 10);
  return `AG-${String(num + 1).padStart(4, '0')}`;
}

// ============================================
// 入力バリデーションスキーマ
// ============================================

const createPartnerSchema = z.object({
  partnerTier: z.string().max(50).optional().nullable(),
  parentId: z.number().int().positive().optional().nullable(),
  partnerName: z.string().min(1, '代理店名は必須です').max(200),
  partnerSalutation: z.string().max(100).optional().nullable(),
  partnerType: z.enum(['法人', '個人事業主', '個人', '確認中', '未設定']).default('未設定'),
  partnerPostalCode: z.string().max(10).optional().nullable(),
  partnerAddress: z.string().optional().nullable(),
  partnerPhone: z.string().max(20).optional().nullable(),
  partnerFax: z.string().max(20).optional().nullable(),
  partnerEmail: z.string().email().optional().nullable().or(z.literal('')),
  partnerWebsite: z.string().url().optional().nullable().or(z.literal('')),
  partnerEstablishedDate: z.string().optional().nullable(),
  partnerCorporateNumber: z.string().regex(/^\d{13}$/, '法人番号は13桁の数字で入力してください').optional().nullable().or(z.literal('')),
  partnerInvoiceNumber: z.string().regex(/^T\d{13}$/, 'インボイス番号は「T」+13桁の数字で入力してください').optional().nullable().or(z.literal('')),
  partnerCapital: z.number().int().min(0).optional().nullable(),
  industryId: z.number().int().positive().optional().nullable(),
  partnerBpFormUrl: z.string().optional().nullable().or(z.literal('')),
  partnerBpFormKey: z.string().optional().nullable(),
  partnerFolderUrl: z.string().url().optional().nullable().or(z.literal('')),
  partnerNotes: z.string().optional().nullable(),
  partnerCustomData: z.record(z.unknown()).optional().default({}),
});

// ============================================
// GET /api/v1/partners
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)));
    const search = searchParams.get('search') ?? '';
    const sortItems = parseSortParams(searchParams, 'partnerCode');

    // 事業フィルター
    const businessIdParam = searchParams.get('businessId');
    const businessIdFilter = businessIdParam
      ? { businessLinks: { some: { businessId: parseInt(businessIdParam, 10), linkStatus: 'active' } } }
      : {};

    const where = {
      ...(search
        ? {
            OR: [
              { partnerName: { contains: search, mode: 'insensitive' as const } },
              { partnerCode: { contains: search, mode: 'insensitive' as const } },
              { contacts: { some: { contactName: { contains: search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
      ...whereIn(searchParams, 'partnerType'),
      ...whereIn(searchParams, 'partnerTier'),
      ...whereIn(searchParams, 'industryId', 'industryId', (v) => parseInt(v, 10)),
      ...whereContains(searchParams, 'partnerAddress'),
      ...whereDateRange(searchParams, 'createdAt'),
      ...whereDateRange(searchParams, 'partnerEstablishedDate'),
      ...(whereBoolean(searchParams, 'isActive', 'partnerIsActive') ?? {}),
      ...businessIdFilter,
    };

    const orderBy = buildOrderBy(sortItems, PARTNER_SORT_FIELDS, [{ field: 'partnerCode', direction: 'asc' }]);

    const [total, partners] = await Promise.all([
      prisma.partner.count({ where }),
      prisma.partner.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          industry: { select: { id: true, industryName: true } },
          parent: { select: { id: true, partnerCode: true, partnerName: true } },
          contacts: {
            select: {
              id: true,
              contactName: true,
              contactDepartment: true,
              contactPosition: true,
              contactPhone: true,
              contactEmail: true,
              contactIsRepresentative: true,
              contactIsPrimary: true,
            },
            orderBy: { contactSortOrder: 'asc' },
          },
          businessLinks: {
            where: { linkStatus: 'active' },
            select: {
              businessId: true,
              businessTier: true,
              businessTierNumber: true,
              linkCustomData: true,
            },
          },
        },
      }),
    ]);

    const targetBusinessId = businessIdParam ? parseInt(businessIdParam, 10) : undefined;
    return NextResponse.json({
      success: true,
      data: partners.map((p) => formatPartner(p, targetBusinessId)),
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
// POST /api/v1/partners
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const data = createPartnerSchema.parse(body);

    // 名前+電話番号の完全一致 重複チェック
    if (data.partnerPhone) {
      const duplicate = await prisma.partner.findFirst({
        where: {
          partnerIsActive: true,
          partnerName: data.partnerName,
          partnerPhone: data.partnerPhone,
        },
        select: { id: true, partnerCode: true, partnerName: true },
      });
      if (duplicate) {
        throw ApiError.conflict(
          `同名+同電話番号の代理店が既に存在します（${duplicate.partnerCode}: ${duplicate.partnerName}）`,
        );
      }
    }

    // 親代理店から階層を自動算出（N次対応）
    const parentId = data.parentId ?? null;

    const partner = await prisma.$transaction(async (tx) => {
      // parentId から partnerTier を自動算出
      const partnerTier = await calculateTierFromParent(tx, parentId);

      // 1次代理店なら parentId を強制 null
      const effectiveParentId = partnerTier === '1次代理店' ? null : parentId;

      // 階層整合性チェック
      const tierError = await validateTierHierarchy(tx, partnerTier, effectiveParentId);
      if (tierError) {
        throw new ApiError('VALIDATION_ERROR', tierError, 400, [
          { field: 'parentId', message: tierError },
        ]);
      }

      const partnerCode = await generatePartnerCode();
      const partnerTierNumber = await generateTierNumber(tx, partnerTier, effectiveParentId, partnerCode);

      return tx.partner.create({
        data: {
          partnerCode,
          partnerTier,
          partnerTierNumber,
          parentId: effectiveParentId,
          partnerName: data.partnerName,
          partnerSalutation: data.partnerSalutation ?? null,
          partnerType: data.partnerType,
          partnerPostalCode: data.partnerPostalCode ?? null,
          partnerAddress: data.partnerAddress ?? null,
          partnerPhone: data.partnerPhone ?? null,
          partnerFax: data.partnerFax ?? null,
          partnerEmail: data.partnerEmail || null,
          partnerWebsite: data.partnerWebsite || null,
          partnerEstablishedDate: data.partnerEstablishedDate ? new Date(data.partnerEstablishedDate) : null,
          partnerCorporateNumber: data.partnerCorporateNumber || null,
          partnerInvoiceNumber: data.partnerInvoiceNumber || null,
          partnerCapital: data.partnerCapital != null ? BigInt(data.partnerCapital) : null,
          industryId: data.industryId ?? null,
          partnerBpFormUrl: data.partnerBpFormUrl || null,
          partnerBpFormKey: data.partnerBpFormKey || null,
          partnerFolderUrl: data.partnerFolderUrl || null,
          partnerNotes: data.partnerNotes ?? null,
          partnerCustomData: (data.partnerCustomData ?? {}) as object,
          createdBy: user.id,
          updatedBy: user.id,
        },
        include: {
          industry: { select: { id: true, industryName: true } },
          parent: { select: { id: true, partnerCode: true, partnerName: true } },
        },
      });
    });

    return NextResponse.json({ success: true, data: formatPartner(partner) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
