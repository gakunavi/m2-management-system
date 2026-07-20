import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import type { Prisma } from '@prisma/client';
import { parseSortParams, buildSelectOptionOrderMap } from '@/lib/sort-helper';
import { resolveSort, applyAppSort, withCustomDataFields } from '@/lib/sort/engine';
import { PROJECT_SORT_SPEC } from '@/lib/sort/specs';
import type { AppSortContext } from '@/lib/sort/types';
import { formatProject } from '@/lib/format-project';
import { generateProjectNo, createInitialMovements } from '@/lib/project-helpers';
import { getBusinessPartnerScope } from '@/lib/revenue-helpers';
import { computeAllFormulas } from '@/lib/formula-evaluator';
import { calculateShotRewardsByProject } from '@/lib/reward-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

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

    const requestedBusinessId = businessIdParam ? parseInt(businessIdParam, 10) : undefined;
    const requestedPartnerId = partnerIdParam ? parseInt(partnerIdParam, 10) : undefined;

    // 事業フィルター（クエリ指定は「絞り込み」であって権限の緩和ではない）
    if (requestedBusinessId !== undefined) {
      where.businessId = requestedBusinessId;
    }

    // ============================================
    // ロール別スコープ
    // ============================================
    // businessId の指定有無に関わらず必ず適用する。
    // 以前は `if (businessId) {...} else if (role) {...}` の連鎖だったため、
    // ?businessId=X を付けるだけで代理店スコープと portalVisible が外れていた。
    if (user.role === 'staff') {
      // staff は自分がアサインされた事業のみ
      const assignments = await prisma.userBusinessAssignment.findMany({
        where: { userId: user.id },
        select: { businessId: true },
      });
      const assignedBusinessIds = assignments.map((a) => a.businessId);

      if (requestedBusinessId !== undefined) {
        if (!assignedBusinessIds.includes(requestedBusinessId)) {
          throw ApiError.forbidden('この事業の案件を閲覧する権限がありません');
        }
      } else {
        where.businessId = { in: assignedBusinessIds };
      }
    } else if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      // 代理店に partnerId が無い場合は絞り込めないので拒否する（フェイルクローズ）
      if (!user.partnerId) {
        throw ApiError.forbidden('代理店が紐づいていないため案件を閲覧できません');
      }

      where.portalVisible = true;

      if (user.role === 'partner_staff') {
        where.projectAssignedUserId = user.id;
      } else {
        const scopedPartnerIds = await getBusinessPartnerScope(
          prisma,
          user.partnerId,
          requestedBusinessId,
        );

        // partnerId フィルターはスコープと交差させる（スコープ外の指定は拒否）
        if (requestedPartnerId !== undefined) {
          if (!scopedPartnerIds.includes(requestedPartnerId)) {
            throw ApiError.forbidden('この代理店の案件を閲覧する権限がありません');
          }
        } else {
          where.partnerId = { in: scopedPartnerIds };
        }
      }
    }

    // 代理店フィルター（関連案件タブ用）
    // 代理店ロールでは上のスコープ検証を通過した場合のみ適用される
    if (requestedPartnerId !== undefined && where.partnerId === undefined) {
      where.partnerId = requestedPartnerId;
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

    // 統一ソートエンジン: 動的カスタム列を補完した spec でソートを解決
    const spec = withCustomDataFields(PROJECT_SORT_SPEC, sortItems);
    const { prismaOrderBy, appSortItems, needsAppSort: needsSortAppSort } = resolveSort(sortItems, spec);
    const dbOrderBy = (
      prismaOrderBy.length > 0 ? prismaOrderBy : [{ updatedAt: 'desc' }]
    ) as Prisma.ProjectOrderByWithRelationInput[];

    const originalSkip = (page - 1) * pageSize;
    // ソートのアプリ側処理 or カスタムフィールドフィルターがあれば全件取得してアプリ側でページング
    const appPaginate = needsSortAppSort || hasCustomFieldFilter;

    const [total, allProjects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: dbOrderBy,
        skip: appPaginate ? undefined : originalSkip,
        take: appPaginate ? undefined : pageSize,
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
          if (typeof fieldVal === 'boolean') return values.includes(String(fieldVal));
          return values.some((v) => String(fieldVal).includes(v));
        });
      });
    }

    // ステータスラベル・色を一括取得（フォーマット対象 = filteredProjects 全件）
    const statusCodes = Array.from(new Set(filteredProjects.map((p) => p.projectSalesStatus)));
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
    const businessIds = Array.from(new Set(filteredProjects.map((p) => p.businessId)));
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

    // 列設定用: 事業ごとのショット報酬額（直紹介・間接）を計算し、案件IDでまとめる
    const shotRewardsByProject = new Map<number, { direct: number | null; indirect: number | null }>();
    if (businessIds.length > 0) {
      const perBusiness = await Promise.all(
        businessIds.map((bizId) => calculateShotRewardsByProject(prisma, bizId)),
      );
      for (const m of perBusiness) {
        m.forEach((amounts, projectId) => shotRewardsByProject.set(projectId, amounts));
      }
    }

    // 1案件をフラット展開込みでフォーマット（ソート対象フィールドは全てフラットに展開）
    const formatRow = (p: (typeof filteredProjects)[number]) => {
      const formatted = formatProject(p);
      const status = statusMap.get(`${p.businessId}:${p.projectSalesStatus}`);
      const customData = p.projectCustomData as Record<string, unknown> | null;
      const flatCustom: Record<string, unknown> = {};
      if (customData) {
        for (const [k, v] of Object.entries(customData)) flatCustom[`customData_${k}`] = v;
      }
      const fields = businessFieldsMap.get(p.businessId);
      if (fields) {
        const formulaResults = computeAllFormulas(fields, customData);
        for (const [k, v] of Object.entries(formulaResults)) flatCustom[`customData_${k}`] = v;
      }
      const customer = p.customer as Record<string, unknown> | null;
      const customerLinks = (customer?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
      const customerLink = customerLinks.find((l) => l.businessId === p.businessId);
      const customerLinkData = (customerLink?.linkCustomData ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(customerLinkData)) flatCustom[`customerLink_${k}`] = v;
      const customerGlobalData = (customer?.customerCustomData ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(customerGlobalData)) flatCustom[`customerGlobal_${k}`] = v;
      const partner = p.partner as Record<string, unknown> | null;
      const partnerLinks = (partner?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
      const partnerLink = partnerLinks.find((l) => l.businessId === p.businessId);
      const partnerLinkData = (partnerLink?.linkCustomData ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(partnerLinkData)) flatCustom[`partnerLink_${k}`] = v;
      const partnerGlobalData = (partner?.partnerCustomData ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(partnerGlobalData)) flatCustom[`partnerGlobal_${k}`] = v;

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

      const shotReward = shotRewardsByProject.get(p.id);

      return {
        ...formatted,
        ...flatCustom,
        ...customerFlat,
        ...partnerFlat,
        customerLinkCustomData: customerLinkData,
        customerCustomData: customerGlobalData,
        partnerLinkCustomData: partnerLinkData,
        partnerCustomData: partnerGlobalData,
        projectSalesStatusLabel: status?.label ?? null,
        projectSalesStatusColor: status?.color ?? null,
        rewardShotDirect: shotReward?.direct ?? null,
        rewardShotIndirect: shotReward?.indirect ?? null,
        // アプリ側ソート(status戦略)のキーに使用
        businessId: p.businessId,
      };
    };

    let formattedRows = filteredProjects.map(formatRow);

    // アプリ側ソート（必要時）。status / customData の順序マップを用意して合成ソート
    if (needsSortAppSort) {
      const ctx: AppSortContext = {};
      if (appSortItems.some((s) => spec[s.field]?.kind === 'status')) {
        const defs = businessIds.length > 0
          ? await prisma.businessStatusDefinition.findMany({
              where: { businessId: { in: businessIds } },
              select: { businessId: true, statusCode: true, statusSortOrder: true },
            })
          : [];
        ctx.statusOrder = new Map(defs.map((d) => [`${d.businessId}:${d.statusCode}`, d.statusSortOrder]));
      }
      if (appSortItems.some((s) => spec[s.field]?.kind === 'customData')) {
        const bizConfigs = businessIds.length > 0
          ? await prisma.business.findMany({ where: { id: { in: businessIds } }, select: { businessConfig: true } })
          : [];
        const allFields = bizConfigs.flatMap((b) => {
          const cfg = b.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
          return cfg?.projectFields ?? [];
        });
        ctx.customSelectOrder = buildSelectOptionOrderMap(allFields);
      }
      formattedRows = applyAppSort(formattedRows, appSortItems, spec, ctx);
    }

    // ページング: アプリ側処理時はここでスライス（DB側ページング済みならそのまま）
    const pageRows = appPaginate
      ? formattedRows.slice(originalSkip, originalSkip + pageSize)
      : formattedRows;

    return NextResponse.json({
      success: true,
      data: pageRows,
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
