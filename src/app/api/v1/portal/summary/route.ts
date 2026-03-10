import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  getCurrentMonth,
  getPreviousMonth,
  getBusinessPartnerScope,
  getRevenueAmount,
  getRevenueMonth,
  getKpiDefinitions,
  getPrimaryKpiDefinition,
  getKpiDefinition,
} from '@/lib/revenue-helpers';
import type { DashboardSummary, KpiSummaryItem, KpiDefinition, PortalBusinessSummary } from '@/types/dashboard';

// ============================================
// ヘルパー
// ============================================

function resolveChangeType(current: number, previous: number): 'positive' | 'negative' | 'neutral' {
  if (current > previous) return 'positive';
  if (current < previous) return 'negative';
  return 'neutral';
}

function calcChangeRate(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ============================================
// パートナースコープでプロジェクトを取得
// ============================================

interface ScopedProject {
  businessId: number;
  projectSalesStatus: string;
  projectExpectedCloseMonth: string | null;
  projectCustomData: unknown;
}

async function getPortalProjects(
  user: { id: number; role: string; partnerId: number },
  businessId: number | null,
): Promise<ScopedProject[]> {
  const where: Record<string, unknown> = { projectIsActive: true };

  if (user.role === 'partner_admin') {
    const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessId ?? undefined);
    where.partnerId = { in: partnerIds };
  } else {
    where.projectAssignedUserId = user.id;
  }

  if (businessId !== null) {
    where.businessId = businessId;
  }

  return prisma.project.findMany({
    where,
    select: {
      businessId: true,
      projectSalesStatus: true,
      projectExpectedCloseMonth: true,
      projectCustomData: true,
    },
  });
}

// ============================================
// 月フィルター判定
// ============================================

function matchesPeriod(
  project: ScopedProject,
  dateField: string,
  periodMode: 'month' | 'range' | 'all',
  targetMonth: string | null,
  startMonth: string | null,
  endMonth: string | null,
): boolean {
  if (periodMode === 'all') return true;

  const month = getRevenueMonth(
    { id: 0, projectExpectedCloseMonth: project.projectExpectedCloseMonth, projectCustomData: project.projectCustomData },
    dateField,
  );
  if (!month) return false;

  if (periodMode === 'month') {
    return month === targetMonth;
  }

  // range
  if (startMonth && month < startMonth) return false;
  if (endMonth && month > endMonth) return false;
  return true;
}

// ============================================
// GET /api/v1/portal/summary
// DashboardSummary 形式で返す（社内版と同一構造）
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };
    if (!['partner_admin', 'partner_staff'].includes(user.role)) throw ApiError.forbidden();
    if (!user.partnerId) throw ApiError.forbidden('代理店情報が設定されていません');

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;
    const kpiKeyParam = searchParams.get('kpiKey') ?? null;
    const monthParam = searchParams.get('month') ?? null;
    const startMonthParam = searchParams.get('startMonth') ?? null;
    const endMonthParam = searchParams.get('endMonth') ?? null;
    const periodParam = searchParams.get('period') ?? null;

    // ============================================
    // 期間モード判定
    // ============================================

    type PeriodMode = 'month' | 'range' | 'all';
    let periodMode: PeriodMode;
    let currentMonth: string;
    let previousMonth: string | null = null;
    let rangeStart: string | null = null;
    let rangeEnd: string | null = null;

    if (periodParam === 'all') {
      periodMode = 'all';
      currentMonth = getCurrentMonth();
    } else if (startMonthParam) {
      periodMode = 'range';
      rangeStart = startMonthParam;
      rangeEnd = endMonthParam ?? null;
      currentMonth = endMonthParam ?? getCurrentMonth();
    } else {
      periodMode = 'month';
      currentMonth = monthParam ?? getCurrentMonth();
      previousMonth = getPreviousMonth(currentMonth);
    }

    // ============================================
    // プロジェクト取得（パートナースコープ）
    // ============================================

    const projects = await getPortalProjects(
      { id: user.id, role: user.role, partnerId: user.partnerId },
      businessId,
    );

    // ============================================
    // 対象事業の情報を取得
    // ============================================

    const businessIdSet = new Set(projects.map((p) => p.businessId));
    const businesses = await prisma.business.findMany({
      where: { id: { in: Array.from(businessIdSet) }, businessIsActive: true },
      select: { id: true, businessName: true, businessConfig: true },
      orderBy: { businessSortOrder: 'asc' },
    });

    // ============================================
    // KPI定義の解決
    // ============================================

    let resolvedKpiKey: string | null = null;
    const businessKpiMap = new Map<number, { kpi: KpiDefinition | null; dateField: string; statusFilters: string[] | null }>();

    for (const biz of businesses) {
      const kpi = kpiKeyParam
        ? getKpiDefinition(biz.businessConfig, kpiKeyParam)
        : getPrimaryKpiDefinition(biz.businessConfig);

      const statusFilters = kpi?.statusFilter
        ? Array.isArray(kpi.statusFilter) ? kpi.statusFilter : [kpi.statusFilter]
        : null;

      businessKpiMap.set(biz.id, {
        kpi,
        dateField: kpi?.dateField ?? 'projectExpectedCloseMonth',
        statusFilters,
      });

      if (kpi && !resolvedKpiKey) resolvedKpiKey = kpi.key;
    }

    // ============================================
    // KPI集計: 事業ごとに current/previous を計算
    // ============================================

    interface BizAcc {
      currentAmount: number;
      previousAmount: number;
      currentWon: number;
      previousWon: number;
      currentTotal: number;
    }

    const bizAccMap = new Map<number, BizAcc>();

    const projectAsRevenue = (p: ScopedProject) => ({
      id: 0,
      projectExpectedCloseMonth: p.projectExpectedCloseMonth,
      projectCustomData: p.projectCustomData,
    });

    for (const project of projects) {
      const bizKpi = businessKpiMap.get(project.businessId);
      if (!bizKpi) continue;

      const { kpi, dateField, statusFilters } = bizKpi;
      const acc = bizAccMap.get(project.businessId) ?? {
        currentAmount: 0, previousAmount: 0,
        currentWon: 0, previousWon: 0,
        currentTotal: 0,
      };

      const isCurrent = matchesPeriod(project, dateField, periodMode, currentMonth, rangeStart, rangeEnd);
      const isPrevious = periodMode === 'month' && previousMonth
        ? matchesPeriod(project, dateField, 'month', previousMonth, null, null)
        : false;

      if (isCurrent) {
        acc.currentTotal++;
        if (kpi && statusFilters && statusFilters.includes(project.projectSalesStatus)) {
          if (kpi.aggregation === 'sum' && kpi.sourceField) {
            acc.currentAmount += getRevenueAmount(projectAsRevenue(project), kpi.sourceField);
          } else if (kpi.aggregation === 'count') {
            acc.currentAmount += 1;
          }
          acc.currentWon++;
        }
      }

      if (isPrevious) {
        if (kpi && statusFilters && statusFilters.includes(project.projectSalesStatus)) {
          if (kpi.aggregation === 'sum' && kpi.sourceField) {
            acc.previousAmount += getRevenueAmount(projectAsRevenue(project), kpi.sourceField);
          } else if (kpi.aggregation === 'count') {
            acc.previousAmount += 1;
          }
          acc.previousWon++;
        }
      }

      bizAccMap.set(project.businessId, acc);
    }

    // ============================================
    // 全事業の合算
    // ============================================

    let totalCurrentAmount = 0;
    let totalPreviousAmount = 0;
    let totalCurrentWon = 0;
    let totalPreviousWon = 0;
    let totalCurrentProjects = 0;

    for (const acc of Array.from(bizAccMap.values())) {
      totalCurrentAmount += acc.currentAmount;
      totalPreviousAmount += acc.previousAmount;
      totalCurrentWon += acc.currentWon;
      totalPreviousWon += acc.previousWon;
      totalCurrentProjects += acc.currentTotal;
    }

    // ============================================
    // kpiSummaries（KPIタブ切替用 — 事業指定時のみ）
    // ============================================

    let kpiSummaries: KpiSummaryItem[] | undefined;

    if (businessId !== null) {
      const biz = businesses.find((b) => b.id === businessId);
      if (biz) {
        const allKpis = getKpiDefinitions(biz.businessConfig);
        if (allKpis.length > 0) {
          kpiSummaries = allKpis.map((kpi) => {
            const sf = kpi.statusFilter
              ? Array.isArray(kpi.statusFilter) ? kpi.statusFilter : [kpi.statusFilter]
              : null;
            const df = kpi.dateField ?? 'projectExpectedCloseMonth';

            let cur = 0;
            let prev = 0;
            for (const p of projects) {
              if (p.businessId !== businessId) continue;
              if (!sf || !sf.includes(p.projectSalesStatus)) continue;

              const isCur = matchesPeriod(p, df, periodMode, currentMonth, rangeStart, rangeEnd);
              const isPrev = periodMode === 'month' && previousMonth
                ? matchesPeriod(p, df, 'month', previousMonth, null, null)
                : false;

              if (isCur) {
                if (kpi.aggregation === 'sum' && kpi.sourceField) {
                  cur += getRevenueAmount(projectAsRevenue(p), kpi.sourceField);
                } else if (kpi.aggregation === 'count') {
                  cur += 1;
                }
              }
              if (isPrev) {
                if (kpi.aggregation === 'sum' && kpi.sourceField) {
                  prev += getRevenueAmount(projectAsRevenue(p), kpi.sourceField);
                } else if (kpi.aggregation === 'count') {
                  prev += 1;
                }
              }
            }

            return {
              kpiKey: kpi.key,
              label: kpi.label,
              unit: kpi.unit,
              current: cur,
              previous: prev,
              changeRate: periodMode === 'month' ? calcChangeRate(cur, prev) : 0,
              changeType: periodMode === 'month' ? resolveChangeType(cur, prev) : 'neutral' as const,
              targetAmount: 0,
              achievementRate: 0,
            };
          });
        }
      }
    }

    // ============================================
    // portalBusinesses（全事業ビュー用カードデータ）
    // ============================================

    let portalBusinesses: PortalBusinessSummary[] | undefined;

    if (businessId === null) {
      portalBusinesses = businesses.map((biz) => {
        const acc = bizAccMap.get(biz.id);
        const kpi = getPrimaryKpiDefinition(biz.businessConfig);
        return {
          businessId: biz.id,
          businessName: biz.businessName,
          totalAmount: acc?.currentAmount ?? 0,
          projectCount: acc?.currentTotal ?? 0,
          wonProjectCount: acc?.currentWon ?? 0,
          kpiUnit: kpi?.unit,
        };
      });
    }

    // ============================================
    // kpiDefinitions（事業別ビューのKPIタブ用）
    // ============================================

    let kpiDefinitions: KpiDefinition[] | undefined;

    if (businessId !== null) {
      const biz = businesses.find((b) => b.id === businessId);
      if (biz) {
        const defs = getKpiDefinitions(biz.businessConfig);
        if (defs.length > 0) kpiDefinitions = defs;
      }
    }

    // ============================================
    // レスポンス構築
    // ============================================

    const isMonthMode = periodMode === 'month';

    const data: DashboardSummary & {
      portalBusinesses?: PortalBusinessSummary[];
      kpiDefinitions?: KpiDefinition[];
    } = {
      currentMonth,
      revenue: {
        current: totalCurrentAmount,
        previous: totalPreviousAmount,
        changeRate: isMonthMode ? calcChangeRate(totalCurrentAmount, totalPreviousAmount) : 0,
        changeType: isMonthMode ? resolveChangeType(totalCurrentAmount, totalPreviousAmount) : 'neutral',
      },
      achievementRate: {
        current: 0,
        previous: 0,
        changePoints: 0,
        changeType: 'neutral',
      },
      totalProjects: {
        current: totalCurrentProjects,
        previous: totalCurrentProjects,
        change: 0,
        changeType: 'neutral',
      },
      wonProjects: {
        current: totalCurrentWon,
        previous: totalPreviousWon,
        change: isMonthMode ? totalCurrentWon - totalPreviousWon : 0,
        changeType: isMonthMode ? resolveChangeType(totalCurrentWon, totalPreviousWon) : 'neutral',
      },
      ...(kpiSummaries && kpiSummaries.length > 0 && { kpiSummaries }),
      ...(portalBusinesses && { portalBusinesses }),
      ...(kpiDefinitions && { kpiDefinitions }),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
