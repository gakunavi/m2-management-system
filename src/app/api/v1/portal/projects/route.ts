import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getBusinessPartnerScope, getRevenueRecognition, getRevenueAmount, getActiveFieldKeys, injectFormulaValues } from '@/lib/revenue-helpers';

export const dynamic = 'force-dynamic';
import {
  isCustomDataSort,
  applyAppSortAndSlice,
  type SortItem,
} from '@/lib/sort-helper';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// 型定義
// ============================================

type SessionUser = { id: number; role: string; partnerId: number | null };

type PortalProject = {
  projectNo: string;
  customerName: string;
  partnerName: string;
  businessName: string;
  projectSalesStatus: string;
  projectSalesStatusLabel: string;
  projectSalesStatusColor: string;
  projectExpectedCloseMonth: string | null;
  amount: number | null;
  projectAssignedUserName: string | null;
  updatedAt: string;
  customFields: Record<string, unknown>;
};

// ============================================
// ソートフィールドマッピング
// ============================================

type SortOrder = 'asc' | 'desc';

type OrderByClause =
  | { projectNo: SortOrder }
  | { customer: { customerName: SortOrder } }
  | { partner: { partnerName: SortOrder } }
  | { business: { businessName: SortOrder } }
  | { projectSalesStatus: SortOrder }
  | { projectExpectedCloseMonth: SortOrder }
  | { projectAssignedUserName: SortOrder }
  | { updatedAt: SortOrder };

const VALID_SORT_FIELDS = [
  'projectNo', 'customerName', 'partnerName', 'businessName',
  'projectSalesStatus', 'projectExpectedCloseMonth', 'projectAssignedUserName',
  'updatedAt',
] as const;
type SortField = (typeof VALID_SORT_FIELDS)[number];

/** ステータスソートはアプリ側で statusSortOrder を使う */
function isStatusSort(sortBy: string): boolean {
  return sortBy === 'projectSalesStatus';
}

function buildPortalOrderBy(sortBy: string, sortOrder: SortOrder): OrderByClause | null {
  // カスタムフィールド or ステータスソートの場合は DB orderBy なし（アプリ側ソート）
  if (isCustomDataSort(sortBy) || isStatusSort(sortBy)) return null;

  const field = VALID_SORT_FIELDS.includes(sortBy as SortField)
    ? (sortBy as SortField)
    : 'updatedAt';

  switch (field) {
    case 'projectNo':
      return { projectNo: sortOrder };
    case 'customerName':
      return { customer: { customerName: sortOrder } };
    case 'partnerName':
      return { partner: { partnerName: sortOrder } };
    case 'businessName':
      return { business: { businessName: sortOrder } };
    case 'projectSalesStatus':
      return { projectSalesStatus: sortOrder };
    case 'projectExpectedCloseMonth':
      return { projectExpectedCloseMonth: sortOrder };
    case 'projectAssignedUserName':
      return { projectAssignedUserName: sortOrder };
    case 'updatedAt':
    default:
      return { updatedAt: sortOrder };
  }
}

// ============================================
// GET /api/v1/portal/projects
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as SessionUser;

    // パートナーロールのみアクセス許可
    if (user.role !== 'partner_admin' && user.role !== 'partner_staff') {
      throw ApiError.forbidden('パートナーポータル専用エンドポイントです');
    }

    if (!user.partnerId) {
      throw ApiError.forbidden('代理店情報が設定されていません');
    }

    const { searchParams } = request.nextUrl;

    // クエリパラメータ解析
    const businessIdParam = searchParams.get('businessId');
    const statusesParam = searchParams.get('statuses');
    const search = searchParams.get('search') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)));
    const sortByParam = searchParams.get('sortBy') ?? 'updatedAt';
    const sortOrderParam = searchParams.get('sortOrder') ?? 'desc';
    const sortOrder: SortOrder = sortOrderParam === 'asc' ? 'asc' : 'desc';

    // アプリ側ソート判定（カスタムフィールド or ステータス）
    const isCustomSort = isCustomDataSort(sortByParam) || isStatusSort(sortByParam);

    // WHERE 句構築
    const where: Record<string, unknown> = {
      projectIsActive: true,
    };

    // ロール別スコープ制御
    if (user.role === 'partner_admin') {
      // partner_admin: 事業別階層で自社 + 下位代理店すべての案件
      const businessIdForScope = businessIdParam ? parseInt(businessIdParam, 10) : undefined;
      const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessIdForScope);
      where.partnerId = { in: partnerIds };
    } else {
      // partner_staff: 自分がアサインされた案件のみ
      where.projectAssignedUserId = user.id;
    }

    // 事業フィルター（任意）
    if (businessIdParam) {
      const businessId = parseInt(businessIdParam, 10);
      if (!isNaN(businessId)) {
        where.businessId = businessId;
      }
    }

    // テキスト検索
    if (search) {
      where.OR = [
        { projectNo: { contains: search, mode: 'insensitive' } },
        { customer: { customerName: { contains: search, mode: 'insensitive' } } },
        { projectAssignedUserName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 営業ステータスフィルター
    if (statusesParam) {
      const statuses = statusesParam.split(',').filter(Boolean);
      if (statuses.length > 0) {
        where.projectSalesStatus = { in: statuses };
      }
    }

    const orderBy = buildPortalOrderBy(sortByParam, sortOrder);
    const skip = (page - 1) * pageSize;

    // ステータス定義を取得（事業選択時のみ）
    const statusDefinitions = businessIdParam
      ? await prisma.businessStatusDefinition.findMany({
          where: {
            businessId: parseInt(businessIdParam, 10),
            statusIsActive: true,
          },
          select: {
            statusCode: true,
            statusLabel: true,
            statusColor: true,
            statusSortOrder: true,
          },
          orderBy: { statusSortOrder: 'asc' },
        })
      : [];

    // 案件一覧 + 件数を並列取得
    // カスタムフィールドソート時は全件取得してアプリ側でソート
    const [total, allProjects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        ...(orderBy ? { orderBy } : {}),
        ...(isCustomSort ? {} : { skip, take: pageSize }),
        select: {
          id: true,
          businessId: true,
          projectNo: true,
          projectSalesStatus: true,
          projectExpectedCloseMonth: true,
          projectAssignedUserName: true,
          projectCustomData: true,
          updatedAt: true,
          business: {
            select: {
              businessName: true,
              businessConfig: true,
            },
          },
          customer: {
            select: {
              customerName: true,
            },
          },
          partner: {
            select: {
              partnerName: true,
            },
          },
        },
      }),
    ]);

    // アプリ側ソート（カスタムフィールド or ステータス）
    let projects = allProjects;
    if (isCustomSort) {
      if (isStatusSort(sortByParam)) {
        // ステータスソート: statusSortOrder マップで優先順位順に並べ替え
        const allBizIds = Array.from(new Set(allProjects.map((p) => p.businessId)));
        const allStatusDefs = allBizIds.length > 0
          ? await prisma.businessStatusDefinition.findMany({
              where: { businessId: { in: allBizIds } },
              select: { businessId: true, statusCode: true, statusSortOrder: true },
            })
          : [];
        // businessId:statusCode → statusSortOrder のマップ
        const sortOrderMap = new Map<string, number>();
        for (const sd of allStatusDefs) {
          sortOrderMap.set(`${sd.businessId}:${sd.statusCode}`, sd.statusSortOrder);
        }
        const direction = sortOrder === 'asc' ? 1 : -1;
        const sorted = [...allProjects].sort((a, b) => {
          const aOrder = sortOrderMap.get(`${a.businessId}:${a.projectSalesStatus}`) ?? 9999;
          const bOrder = sortOrderMap.get(`${b.businessId}:${b.projectSalesStatus}`) ?? 9999;
          return (aOrder - bOrder) * direction;
        });
        projects = sorted.slice(skip, skip + pageSize);
      } else {
        // カスタムフィールドソート
        projects = applyAppSortAndSlice(
          allProjects,
          [{ field: sortByParam, direction: sortOrder }] as SortItem[],
          (p) => p.projectCustomData as Record<string, unknown> | null,
          skip,
          pageSize,
        );
      }
    }

    // ステータスラベル・色を一括取得（businessId:statusCode キーでマッピング）
    const uniqueBusinessIds = Array.from(new Set(projects.map((p) => p.businessId)));
    const statusCodes = Array.from(new Set(projects.map((p) => p.projectSalesStatus)));

    const statusDefs =
      uniqueBusinessIds.length > 0 && statusCodes.length > 0
        ? await prisma.businessStatusDefinition.findMany({
            where: {
              businessId: { in: uniqueBusinessIds },
              statusCode: { in: statusCodes },
              statusIsActive: true,
            },
            select: {
              businessId: true,
              statusCode: true,
              statusLabel: true,
              statusColor: true,
            },
          })
        : [];

    const statusMap = new Map(
      statusDefs.map((s) => [
        `${s.businessId}:${s.statusCode}`,
        { label: s.statusLabel, color: s.statusColor ?? null },
      ]),
    );

    // 事業ごとの全フィールド定義 + 代理店表示フィールドを収集
    const partnerFieldsMap = new Map<number, ProjectFieldDefinition[]>();
    const allBusinessFieldsMap = new Map<number, ProjectFieldDefinition[]>();
    const businessConfigMap = new Map<number, unknown>();
    const sourceForFieldDefs = isCustomSort ? allProjects : projects;
    for (const p of sourceForFieldDefs) {
      if (!businessConfigMap.has(p.businessId) && p.business?.businessConfig) {
        businessConfigMap.set(p.businessId, p.business.businessConfig);
        const config = p.business.businessConfig as Record<string, unknown>;
        const allFields = (config?.projectFields ?? []) as ProjectFieldDefinition[];
        allBusinessFieldsMap.set(p.businessId, allFields);
        const visibleFields = allFields.filter((f) => f.visibleToPartner);
        partnerFieldsMap.set(p.businessId, visibleFields);
      }
    }

    // formula フィールドの再計算（全フィールド定義を使って計算）
    for (const [bizId, fields] of Array.from(allBusinessFieldsMap)) {
      if (fields.some((f: ProjectFieldDefinition) => f.type === 'formula')) {
        const bizProjects = projects.filter((p) => p.businessId === bizId);
        injectFormulaValues(bizProjects, fields);
      }
    }

    // 重複キー除去した fieldDefinitions
    const allFieldDefs = Array.from(partnerFieldsMap.values()).flat();
    const fieldDefinitions = Array.from(new Map(allFieldDefs.map((f) => [f.key, { key: f.key, label: f.label, type: f.type }])).values());

    // レスポンスデータ整形
    const data: PortalProject[] = projects.map((p) => {
      const statusKey = `${p.businessId}:${p.projectSalesStatus}`;
      const statusDef = statusMap.get(statusKey);

      // 事業設定から売上計上ルールを取得して金額フィールドを決定
      const revenueRecognition = getRevenueRecognition(p.business?.businessConfig ?? null);
      // amountField が現在のフィールド定義に存在する場合のみ金額を計算
      const activeKeys = getActiveFieldKeys(p.business?.businessConfig ?? null);
      const amountFieldExists = revenueRecognition
        ? activeKeys.has(revenueRecognition.amountField)
        : false;
      const amount = revenueRecognition && amountFieldExists
        ? getRevenueAmount(
            {
              id: p.id,
              projectExpectedCloseMonth: p.projectExpectedCloseMonth,
              projectCustomData: p.projectCustomData,
            },
            revenueRecognition.amountField,
          )
        : null;

      // 代理店表示フィールドの値を抽出
      const visibleFields = partnerFieldsMap.get(p.businessId) ?? [];
      const customData = (p.projectCustomData as Record<string, unknown>) ?? {};
      const customFields: Record<string, unknown> = {};
      for (const f of visibleFields) {
        customFields[f.key] = customData[f.key] ?? null;
      }

      return {
        projectNo: p.projectNo,
        customerName: p.customer?.customerName ?? '',
        partnerName: p.partner?.partnerName ?? '',
        businessName: p.business?.businessName ?? '',
        projectSalesStatus: p.projectSalesStatus,
        projectSalesStatusLabel: statusDef?.label ?? p.projectSalesStatus,
        projectSalesStatusColor: statusDef?.color ?? '',
        projectExpectedCloseMonth: p.projectExpectedCloseMonth ?? null,
        amount: amount !== null && amount !== 0 ? amount : null,
        projectAssignedUserName: p.projectAssignedUserName ?? null,
        updatedAt: p.updatedAt.toISOString(),
        customFields,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      fieldDefinitions,
      statusDefinitions: statusDefinitions.map((s) => ({
        statusCode: s.statusCode,
        statusLabel: s.statusLabel,
        statusColor: s.statusColor,
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
