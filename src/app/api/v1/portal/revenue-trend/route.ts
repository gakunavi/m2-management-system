import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  getFiscalYearMonths,
  getMonthLabel,
  getBusinessPartnerScope,
  getKpiDefinition,
  getPrimaryKpiDefinition,
  getRevenueAmount,
  getRevenueMonth,
} from '@/lib/revenue-helpers';

// ============================================
// GET /api/v1/portal/revenue-trend?year=2025&businessId=1&kpiKey=revenue
// パートナーポータル用売上推移（目標なし）
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };
    if (!['partner_admin', 'partner_staff'].includes(user.role)) throw ApiError.forbidden();
    if (!user.partnerId) throw ApiError.forbidden('代理店情報が設定されていません');

    const { searchParams } = request.nextUrl;
    const yearParam = searchParams.get('year');
    if (!yearParam) throw ApiError.badRequest('year パラメータが必要です');
    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 2020 || year > 2100) {
      throw ApiError.badRequest('year は 2020〜2100 の範囲で指定してください');
    }

    const businessIdParam = searchParams.get('businessId');
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;
    const kpiKeyParam = searchParams.get('kpiKey') ?? null;

    const fiscalMonths = getFiscalYearMonths(year);
    const startMonth = fiscalMonths[0];
    const endMonth = fiscalMonths[11];

    // ============================================
    // プロジェクト取得（パートナースコープ）
    // ============================================

    const projectWhere: Record<string, unknown> = { projectIsActive: true };

    if (user.role === 'partner_admin') {
      const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessId ?? undefined);
      projectWhere.partnerId = { in: partnerIds };
    } else {
      projectWhere.projectAssignedUserId = user.id;
    }

    if (businessId !== null) {
      projectWhere.businessId = businessId;
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: {
        businessId: true,
        projectSalesStatus: true,
        projectExpectedCloseMonth: true,
        projectCustomData: true,
      },
    });

    // ============================================
    // 対象事業の KPI 定義を取得
    // ============================================

    const businessIdSet = new Set(projects.map((p) => p.businessId));
    const businesses = await prisma.business.findMany({
      where: { id: { in: Array.from(businessIdSet) }, businessIsActive: true },
      select: { id: true, businessConfig: true },
    });

    const businessKpiMap = new Map<number, {
      statusFilters: string[] | null;
      sourceField: string | null;
      dateField: string;
      aggregation: 'sum' | 'count' | null;
    }>();

    let resolvedKpiKey = kpiKeyParam ?? 'revenue';
    let resolvedKpiLabel = '売上金額';
    let resolvedKpiUnit = '円';

    for (const biz of businesses) {
      const kpiDef = kpiKeyParam
        ? getKpiDefinition(biz.businessConfig, kpiKeyParam)
        : getPrimaryKpiDefinition(biz.businessConfig);

      if (!kpiDef) {
        businessKpiMap.set(biz.id, { statusFilters: null, sourceField: null, dateField: 'projectExpectedCloseMonth', aggregation: null });
        continue;
      }

      resolvedKpiKey = kpiDef.key;
      resolvedKpiLabel = kpiDef.label;
      resolvedKpiUnit = kpiDef.unit;

      const statusFilters = kpiDef.statusFilter
        ? Array.isArray(kpiDef.statusFilter) ? kpiDef.statusFilter : [kpiDef.statusFilter]
        : null;

      businessKpiMap.set(biz.id, {
        statusFilters,
        sourceField: kpiDef.aggregation === 'sum' ? kpiDef.sourceField : null,
        dateField: kpiDef.dateField ?? 'projectExpectedCloseMonth',
        aggregation: kpiDef.aggregation,
      });
    }

    // ============================================
    // 月別実績を集計
    // ============================================

    const monthlyTotals = new Map<string, number>();
    for (const m of fiscalMonths) {
      monthlyTotals.set(m, 0);
    }

    for (const p of projects) {
      const kpi = businessKpiMap.get(p.businessId);
      if (!kpi) continue;
      if (kpi.statusFilters && !kpi.statusFilters.includes(p.projectSalesStatus)) continue;

      const month = getRevenueMonth(
        { id: 0, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData },
        kpi.dateField,
      );
      if (!month || month < startMonth || month > endMonth) continue;

      let amount = 0;
      if (kpi.aggregation === 'sum' && kpi.sourceField) {
        amount = getRevenueAmount(
          { id: 0, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData },
          kpi.sourceField,
        );
      } else if (kpi.aggregation === 'count') {
        amount = 1;
      }

      monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + amount);
    }

    // ============================================
    // レスポンス構築（ポータルでは目標なし）
    // ============================================

    const months = fiscalMonths.map((month) => ({
      month,
      monthLabel: getMonthLabel(month),
      targetAmount: 0,
      actualAmount: monthlyTotals.get(month) ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        year,
        kpiKey: resolvedKpiKey,
        kpiLabel: resolvedKpiLabel,
        kpiUnit: resolvedKpiUnit,
        months,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
