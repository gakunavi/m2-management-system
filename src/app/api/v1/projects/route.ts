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
import { latchRevenueConfirmation } from '@/lib/revenue-confirm-latch';
import { generateProjectNo, createInitialMovements } from '@/lib/project-helpers';
import { getBusinessPartnerScope } from '@/lib/revenue-helpers';
import { applyProjectListFilters, matchesCustomFieldFilters } from '@/lib/project-filters';
import { computeAllFormulas } from '@/lib/formula-evaluator';
import {
  calculateProjectFinancialsByBusiness,
  canSeeCompanyRevenue,
  EMPTY_FINANCIALS,
  visibleFinancials,
  type ProjectFinancials,
} from '@/lib/profit-helpers';
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
    const businessIdParam = searchParams.get('businessId');
    const sortItems = parseSortParams(searchParams, 'updatedAt', 'desc');

    // 画面の絞り込み条件（CSV エクスポートと共通ロジック）。
    // ロール別スコープより「先に」適用すること。後勝ちにすると、ユーザー指定の
    // filter[projectAssignedUserId] 等でスコープを上書きできてしまう。
    const where: Record<string, unknown> = {};
    const { customFieldFilters } = applyProjectListFilters(where, searchParams);
    const hasCustomFieldFilter = customFieldFilters.length > 0;

    const partnerIdParam = searchParams.get('filter[partnerId]') || searchParams.get('partnerId');
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
      filteredProjects = allProjects.filter((p) =>
        matchesCustomFieldFilters(
          p.projectCustomData as Record<string, unknown> | null,
          customFieldFilters,
        ),
      );
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

    // 列設定用: 事業ごとの報酬額（ショット/ストック × 担当代理店/上位代理店）・自社売上・粗利を
    // 計算し、案件IDでまとめる
    const financialsByProject = new Map<number, ProjectFinancials>();
    if (businessIds.length > 0) {
      const perBusiness = await Promise.all(
        businessIds.map((bizId) => calculateProjectFinancialsByBusiness(prisma, bizId)),
      );
      for (const m of perBusiness) {
        m.forEach((financials, projectId) => financialsByProject.set(projectId, financials));
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

      // 自社取り分・自社売上・粗利は社内情報。代理店ロールには値を伏せる
      const financials = visibleFinancials(
        financialsByProject.get(p.id) ?? EMPTY_FINANCIALS,
        canSeeCompanyRevenue(user.role),
      );

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
        ...financials,
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

    // 収益確定ステータスでいきなり作られた案件をラッチする（確定日＋手数料の凍結）。
    // トランザクションの外に置くのは、凍結スナップショットの組み立てが
    // 事業設定・代理店階層を読むため、案件が確定済みで存在している必要があるから。
    const latch = await latchRevenueConfirmation(prisma, data.businessId, {
      projectIds: [project.id],
    });

    // ラッチした場合はレスポンスに確定日を反映させる（作成直後の画面が
    // 「未確定」と表示されると、実際は確定済みなのに誤解を招く）
    const responseProject = latch.latched > 0
      ? (await prisma.project.findUnique({ where: { id: project.id }, include: PROJECT_INCLUDE })) ?? project
      : project;

    return NextResponse.json({ success: true, data: formatProject(responseProject) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
