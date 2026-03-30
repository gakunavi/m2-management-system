import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  parseSortParams,
  getCustomSortPagination,
  applyAppSortAndSlice,
  isCustomDataSort,
  buildSelectOptionOrderMap,
} from '@/lib/sort-helper';
import type { SortDirection } from '@/lib/sort-helper';
import { formatProject } from '@/lib/format-project';
import { generateProjectNo, createInitialMovements } from '@/lib/project-helpers';
import { getBusinessPartnerScope } from '@/lib/revenue-helpers';
import { computeAllFormulas } from '@/lib/formula-evaluator';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

/**
 * ソートフィールド → Prisma orderBy マッピング。
 * 直接フィールドとリレーション経由フィールドの両方に対応。
 */
/** ステータスソートはアプリ側で statusSortOrder を使う */
function isStatusSort(field: string): boolean {
  return field === 'projectSalesStatus';
}

const SORT_FIELD_MAP: Record<string, (dir: SortDirection) => Record<string, unknown>> = {
  // 直接フィールド
  projectNo: (dir) => ({ projectNo: dir }),
  // projectSalesStatus はアプリ側ソート（statusSortOrder 使用）
  projectExpectedCloseMonth: (dir) => ({ projectExpectedCloseMonth: dir }),
  projectAssignedUserName: (dir) => ({ projectAssignedUserName: dir }),
  projectRenovationNumber: (dir) => ({ projectRenovationNumber: dir }),
  projectNotes: (dir) => ({ projectNotes: dir }),
  updatedAt: (dir) => ({ updatedAt: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
  // リレーション経由フィールド（顧客）
  customerName: (dir) => ({ customer: { customerName: dir } }),
  customerSalutation: (dir) => ({ customer: { customerSalutation: dir } }),
  customerType: (dir) => ({ customer: { customerType: dir } }),
  customerWebsite: (dir) => ({ customer: { customerWebsite: dir } }),
  customerFiscalMonth: (dir) => ({ customer: { customerFiscalMonth: dir } }),
  customerFolderUrl: (dir) => ({ customer: { customerFolderUrl: dir } }),
  // リレーション経由フィールド（代理店）
  partnerName: (dir) => ({ partner: { partnerName: dir } }),
  partnerCode: (dir) => ({ partner: { partnerCode: dir } }),
  partnerSalutation: (dir) => ({ partner: { partnerSalutation: dir } }),
  partnerFolderUrl: (dir) => ({ partner: { partnerFolderUrl: dir } }),
  // リレーション経由フィールド（事業）
  businessName: (dir) => ({ business: { businessName: dir } }),
};

/** ソートパラメータから Prisma orderBy を構築（リレーションフィールド対応） */
function buildProjectOrderBy(
  sortItems: { field: string; direction: SortDirection }[],
  defaultOrderBy: Record<string, unknown>[],
): Record<string, unknown>[] {
  const orderBy = sortItems
    .filter((item) => !isCustomDataSort(item.field) && !isStatusSort(item.field) && SORT_FIELD_MAP[item.field])
    .map((item) => SORT_FIELD_MAP[item.field](item.direction));

  if (orderBy.length === 0 && !sortItems.some((item) => isCustomDataSort(item.field) || isStatusSort(item.field))) {
    return defaultOrderBy;
  }
  return orderBy;
}

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
  portalVisible: z.boolean().optional().default(true),
});

const PROJECT_INCLUDE = {
  customer: {
    select: {
      id: true, version: true, customerCode: true, customerName: true, customerFolderUrl: true,
      customerSalutation: true, customerType: true, customerWebsite: true, customerFiscalMonth: true,
      customerCustomData: true,
      contacts: {
        where: { contactIsRepresentative: true },
        select: { contactName: true },
        take: 1,
      },
      businessLinks: {
        where: { linkStatus: 'active' },
        select: { businessId: true, linkCustomData: true },
      },
    },
  },
  partner: {
    select: {
      id: true, version: true, partnerCode: true, partnerName: true, partnerFolderUrl: true,
      partnerSalutation: true, partnerCustomData: true,
      businessLinks: {
        where: { linkStatus: 'active' },
        select: { businessId: true, linkCustomData: true },
      },
    },
  },
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
    const portalVisibleParam = searchParams.get('filter[portalVisible]');
    const customerIdParam = searchParams.get('filter[customerId]') || searchParams.get('customerId');
    const partnerIdParam = searchParams.get('filter[partnerId]') || searchParams.get('partnerId');

    const where: Record<string, unknown> = {
      ...(isActiveParam === 'true' ? { projectIsActive: true }
        : isActiveParam === 'false' ? { projectIsActive: false }
        : {}),
    };

    // ポータル表示フィルター
    if (portalVisibleParam === 'true') {
      where.portalVisible = true;
    } else if (portalVisibleParam === 'false') {
      where.portalVisible = false;
    }

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
      where.portalVisible = true;
    } else if (user.role === 'partner_staff') {
      where.projectAssignedUserId = user.id;
      where.portalVisible = true;
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

    // 受注予定月フィルター
    const monthFrom = searchParams.get('filter[expectedCloseMonthFrom]');
    const monthTo = searchParams.get('filter[expectedCloseMonthTo]');
    if (monthFrom || monthTo) {
      where.projectExpectedCloseMonth = {};
      if (monthFrom) {
        (where.projectExpectedCloseMonth as Record<string, string>).gte = monthFrom;
      }
      if (monthTo) {
        (where.projectExpectedCloseMonth as Record<string, string>).lte = monthTo;
      }
    }

    // 担当者フィルター
    if (assignedUserFilter) {
      where.projectAssignedUserId = parseInt(assignedUserFilter, 10);
    }

    // カスタムフィールドフィルター（filter[customField_xxx] 形式）
    const customFieldFilters: { key: string; values: string[] }[] = [];
    searchParams.forEach((paramValue, paramKey) => {
      const cfMatch = paramKey.match(/^filter\[customField_(.+)\]$/);
      if (cfMatch && paramValue) {
        customFieldFilters.push({
          key: cfMatch[1],
          values: paramValue.split(',').filter(Boolean),
        });
      }
    });
    const hasCustomFieldFilter = customFieldFilters.length > 0;

    const defaultOrderBy = [{ updatedAt: 'desc' as const }];
    const orderBy = buildProjectOrderBy(sortItems, defaultOrderBy);
    const originalSkip = (page - 1) * pageSize;
    const hasStatusSort = sortItems.some((item) => isStatusSort(item.field));
    const { skip, take, needsAppSort: needsCustomSort } = getCustomSortPagination(sortItems, originalSkip, pageSize);
    // ステータスソート/カスタムフィールドフィルターもアプリ側で処理（全件取得が必要）
    const needsAppSort = needsCustomSort || hasStatusSort || hasCustomFieldFilter;
    const actualSkip = needsAppSort ? 0 : skip;
    const actualTake = needsAppSort ? undefined : take;

    const [total, allProjects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: orderBy.length > 0 ? orderBy : undefined,
        skip: actualSkip,
        take: actualTake,
        include: PROJECT_INCLUDE,
      }),
    ]);

    // カスタムフィールドフィルター適用（アプリ側）
    let filteredProjects = allProjects;
    if (hasCustomFieldFilter) {
      filteredProjects = allProjects.filter((p) => {
        const customData = p.projectCustomData as Record<string, unknown> | null;
        if (!customData) return false;
        return customFieldFilters.every(({ key, values }) => {
          const fieldVal = customData[key];
          if (fieldVal == null) return false;
          // boolean型
          if (typeof fieldVal === 'boolean') {
            return values.includes(String(fieldVal));
          }
          // select/text: カンマ区切り値のいずれかに一致
          return values.some((v) => String(fieldVal).includes(v));
        });
      });
    }

    // アプリ側ソート＋ページネーション（カスタムフィールド or ステータス or カスタムフィルター）
    let projects = filteredProjects;
    if (needsAppSort) {
      if (hasStatusSort) {
        // ステータスソート: statusSortOrder マップで優先順位順に並べ替え
        const allBizIds = Array.from(new Set(filteredProjects.map((p) => p.businessId)));
        const allStatusDefs = allBizIds.length > 0
          ? await prisma.businessStatusDefinition.findMany({
              where: { businessId: { in: allBizIds } },
              select: { businessId: true, statusCode: true, statusSortOrder: true },
            })
          : [];
        const sortOrderMap = new Map<string, number>();
        for (const sd of allStatusDefs) {
          sortOrderMap.set(`${sd.businessId}:${sd.statusCode}`, sd.statusSortOrder);
        }
        const statusSortItem = sortItems.find((item) => isStatusSort(item.field));
        const direction = statusSortItem?.direction === 'asc' ? 1 : -1;
        projects = [...filteredProjects].sort((a, b) => {
          const aOrder = sortOrderMap.get(`${a.businessId}:${a.projectSalesStatus}`) ?? 9999;
          const bOrder = sortOrderMap.get(`${b.businessId}:${b.projectSalesStatus}`) ?? 9999;
          return (aOrder - bOrder) * direction;
        });
        projects = projects.slice(originalSkip, originalSkip + pageSize);
      } else if (needsCustomSort) {
        // カスタムフィールドソート（select型はオプション定義順）
        const sortBizIds = Array.from(new Set(filteredProjects.map((p) => p.businessId)));
        let selectOrderMap;
        if (sortBizIds.length > 0) {
          const sortBizConfigs = await prisma.business.findMany({
            where: { id: { in: sortBizIds } },
            select: { businessConfig: true },
          });
          const allFields = sortBizConfigs.flatMap((b) => {
            const cfg = b.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
            return cfg?.projectFields ?? [];
          });
          selectOrderMap = buildSelectOptionOrderMap(allFields);
        }
        projects = applyAppSortAndSlice(
          filteredProjects,
          sortItems,
          (p) => p.projectCustomData as Record<string, unknown> | null,
          originalSkip,
          pageSize,
          selectOrderMap,
        );
      } else {
        // カスタムフィールドフィルターのみ（ソートはDB側で済み）→ ページネーションだけ
        projects = filteredProjects.slice(originalSkip, originalSkip + pageSize);
      }
    }

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

    // formula 計算のため、事業のフィールド定義を取得
    const businessIds = Array.from(new Set(projects.map((p) => p.businessId)));
    const businessFieldsMap = new Map<number, ProjectFieldDefinition[]>();
    if (businessIds.length > 0) {
      const businesses = await prisma.business.findMany({
        where: { id: { in: businessIds } },
        select: { id: true, businessConfig: true },
      });
      for (const biz of businesses) {
        const config = biz.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
        const fields = config?.projectFields ?? [];
        if (fields.some((f) => f.type === 'formula')) {
          businessFieldsMap.set(biz.id, fields);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: projects.map((p) => {
        const formatted = formatProject(p);
        const status = statusMap.get(`${p.businessId}:${p.projectSalesStatus}`);
        // customData をフラットキーに展開（EditableCell の URL 型検出用）
        const customData = p.projectCustomData as Record<string, unknown> | null;
        const flatCustom: Record<string, unknown> = {};
        if (customData) {
          for (const [k, v] of Object.entries(customData)) {
            flatCustom[`customData_${k}`] = v;
          }
        }
        // formula フィールドの計算値を注入
        const fields = businessFieldsMap.get(p.businessId);
        if (fields) {
          const formulaResults = computeAllFormulas(fields, customData);
          for (const [k, v] of Object.entries(formulaResults)) {
            flatCustom[`customData_${k}`] = v;
          }
        }
        // 顧客の事業別カスタムデータを展開
        const customer = p.customer as Record<string, unknown> | null;
        const customerLinks = (customer?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
        const customerLink = customerLinks.find((l) => l.businessId === p.businessId);
        const customerLinkData = (customerLink?.linkCustomData ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(customerLinkData)) {
          flatCustom[`customerLink_${k}`] = v;
        }
        // 顧客のグローバルカスタムデータを展開
        const customerGlobalData = (customer?.customerCustomData ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(customerGlobalData)) {
          flatCustom[`customerGlobal_${k}`] = v;
        }
        // 代理店の事業別カスタムデータを展開
        const partner = p.partner as Record<string, unknown> | null;
        const partnerLinks = (partner?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
        const partnerLink = partnerLinks.find((l) => l.businessId === p.businessId);
        const partnerLinkData = (partnerLink?.linkCustomData ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(partnerLinkData)) {
          flatCustom[`partnerLink_${k}`] = v;
        }
        // 代理店のグローバルカスタムデータを展開
        const partnerGlobalData = (partner?.partnerCustomData ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(partnerGlobalData)) {
          flatCustom[`partnerGlobal_${k}`] = v;
        }

        // 顧客/代理店の基本フィールドとversionをフラット展開（インライン編集用）
        const customerFlat: Record<string, unknown> = {};
        if (customer) {
          customerFlat.customerName = customer.customerName ?? null;
          customerFlat.customerSalutation = customer.customerSalutation ?? null;
          customerFlat.customerType = customer.customerType ?? null;
          customerFlat.customerWebsite = customer.customerWebsite ?? null;
          customerFlat.customerFiscalMonth = customer.customerFiscalMonth ?? null;
          customerFlat.customerFolderUrl = customer.customerFolderUrl ?? null;
          customerFlat.customerVersion = customer.version ?? null;
        }
        const partnerFlat: Record<string, unknown> = {};
        if (partner) {
          partnerFlat.partnerName = partner.partnerName ?? null;
          partnerFlat.partnerCode = partner.partnerCode ?? null;
          partnerFlat.partnerSalutation = partner.partnerSalutation ?? null;
          partnerFlat.partnerFolderUrl = partner.partnerFolderUrl ?? null;
          partnerFlat.partnerVersion = partner.version ?? null;
        }

        return {
          ...formatted,
          ...flatCustom,
          ...customerFlat,
          ...partnerFlat,
          // 列のrenderで直接アクセスするためのオブジェクトも保持
          customerLinkCustomData: customerLinkData,
          customerCustomData: customerGlobalData,
          partnerLinkCustomData: partnerLinkData,
          partnerCustomData: partnerGlobalData,
          projectSalesStatusLabel: status?.label ?? null,
          projectSalesStatusColor: status?.color ?? null,
        };
      }),
      meta: {
        page,
        pageSize,
        total: hasCustomFieldFilter ? filteredProjects.length : total,
        totalPages: Math.ceil((hasCustomFieldFilter ? filteredProjects.length : total) / pageSize),
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

    // formula フィールドの計算結果を永続化
    const bizConfig = business?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projectFields = bizConfig?.projectFields ?? [];
    let customDataForCreate = (data.projectCustomData as Record<string, unknown>) ?? {};
    if (projectFields.some((f) => f.type === 'formula')) {
      const formulaResults = computeAllFormulas(projectFields, customDataForCreate);
      customDataForCreate = { ...customDataForCreate, ...formulaResults };
    }

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
          projectRenovationNumber: data.projectRenovationNumber || null,
          projectCustomData: customDataForCreate as object,
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
