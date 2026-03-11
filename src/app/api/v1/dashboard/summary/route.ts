import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

import {
  getCurrentMonth,
  getPreviousMonth,
  getBusinessIdsForUser,
  getKpiDefinitions,
  getPrimaryKpiDefinition,
  getKpiDefinition,
  calculateKpiBatchForBusiness,
} from '@/lib/revenue-helpers';
import type { DashboardSummary, BusinessSummaryItem, KpiSummaryItem } from '@/types/dashboard';

// ============================================
// ヘルパー: changeType 判定
// ============================================

function resolveChangeType(current: number, previous: number): 'positive' | 'negative' | 'neutral' {
  if (current > previous) return 'positive';
  if (current < previous) return 'negative';
  return 'neutral';
}

// ============================================
// ヘルパー: 変化率計算（ゼロ除算対応）
// ============================================

function calcChangeRate(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ============================================
// ヘルパー: 達成率計算（ゼロ除算対応）
// ============================================

function calcAchievementRate(actual: number, target: number): number {
  if (target === 0) return 0;
  return Math.round((actual / target) * 1000) / 10;
}

// ============================================
// ヘルパー: YYYY-MM 範囲の月リストを生成
// ============================================

function generateMonthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let [year, month] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return months;
}

// ============================================
// GET /api/v1/dashboard/summary
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    const monthParam = searchParams.get('month');
    const kpiKeyParam = searchParams.get('kpiKey') ?? null;
    const startMonthParam = searchParams.get('startMonth') ?? null;
    const endMonthParam = searchParams.get('endMonth') ?? null;
    const periodParam = searchParams.get('period') ?? null;

    // ============================================
    // 期間モードの判定
    // ============================================
    // period=all → 全期間モード（前月比較なし）
    // startMonth & endMonth → 範囲モード（前月比較なし）
    // month 指定 or デフォルト → 単月モード（前月比較あり）

    type PeriodMode = 'month' | 'range' | 'all';
    let periodMode: PeriodMode;
    let targetMonths: string[] | null = null; // null = 全期間（フィルターなし）
    let currentMonth: string;
    let previousMonth: string | null = null;

    if (periodParam === 'all') {
      // 全期間モード
      periodMode = 'all';
      currentMonth = getCurrentMonth(); // ラベル用
      targetMonths = null;
    } else if (startMonthParam) {
      // 範囲モード（endMonth 省略時 = startMonth 以降すべて）
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonthParam)) {
        throw ApiError.badRequest('startMonth は YYYY-MM 形式で指定してください');
      }
      if (endMonthParam && !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonthParam)) {
        throw ApiError.badRequest('endMonth は YYYY-MM 形式で指定してください');
      }
      periodMode = 'range';
      if (endMonthParam) {
        currentMonth = endMonthParam; // ラベル用
        targetMonths = generateMonthRange(startMonthParam, endMonthParam);
      } else {
        // endMonth 省略: startMonth 以降すべて → 広い範囲で計算
        currentMonth = getCurrentMonth();
        targetMonths = generateMonthRange(startMonthParam, '2099-12');
      }
    } else {
      // 単月モード（デフォルト: 当月）
      const monthValue = monthParam ?? getCurrentMonth();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue)) {
        throw ApiError.badRequest('month は YYYY-MM 形式で指定してください');
      }
      periodMode = 'month';
      currentMonth = monthValue;
      previousMonth = getPreviousMonth(currentMonth);
      targetMonths = [currentMonth, previousMonth];
    }

    // ユーザーのアクセス可能な事業IDリストを取得
    const allowedIds = await getBusinessIdsForUser(prisma, user);

    // businessId 指定時のアクセス権チェック
    let targetBusinessId: number | null = null;
    if (businessIdParam) {
      targetBusinessId = parseInt(businessIdParam, 10);
      if (isNaN(targetBusinessId)) {
        throw ApiError.badRequest('businessId は整数で指定してください');
      }
      if (allowedIds !== null && !allowedIds.includes(targetBusinessId)) {
        throw ApiError.forbidden();
      }
    }

    // 対象事業を取得
    const businessWhere: Record<string, unknown> = { businessIsActive: true };
    if (targetBusinessId !== null) {
      businessWhere.id = targetBusinessId;
    } else if (allowedIds !== null) {
      businessWhere.id = { in: allowedIds };
    }

    const businesses = await prisma.business.findMany({
      where: businessWhere,
      select: { id: true, businessName: true, businessConfig: true },
      orderBy: { businessSortOrder: 'asc' },
    });

    // ============================================
    // KPI 定義ベースで売上・受注案件数を集計
    // ============================================

    interface KpiAccumulator {
      kpiKey: string;
      label: string;
      unit: string;
      currentValue: number;
      previousValue: number;
      currentProjectCount: number;
      previousProjectCount: number;
    }

    const kpiAccMap = new Map<string, KpiAccumulator>();

    // 全期間モードの場合: 全案件から月一覧を動的に収集して集計
    // 範囲/単月モード: 指定月リストで集計
    await Promise.all(
      businesses.map(async (biz) => {
        const kpiDefs = getKpiDefinitions(biz.businessConfig);
        if (kpiDefs.length === 0) return;

        if (targetMonths) {
          // 単月 or 範囲モード: 指定月リストで集計
          const batchResult = await calculateKpiBatchForBusiness(
            prisma,
            biz.id,
            kpiDefs,
            targetMonths,
          );

          for (const kpi of kpiDefs) {
            const monthMap = batchResult.get(kpi.key);

            let currentTotal = 0;
            let currentCount = 0;
            let previousTotal = 0;
            let previousCount = 0;

            if (periodMode === 'month' && previousMonth) {
              // 単月モード: current vs previous
              const currentActual = monthMap?.get(currentMonth) || { actualValue: 0, projectCount: 0 };
              const previousActual = monthMap?.get(previousMonth) || { actualValue: 0, projectCount: 0 };
              currentTotal = currentActual.actualValue;
              currentCount = currentActual.projectCount;
              previousTotal = previousActual.actualValue;
              previousCount = previousActual.projectCount;
            } else {
              // 範囲モード: 全月を合算
              if (monthMap) {
                Array.from(monthMap.values()).forEach((actual) => {
                  currentTotal += actual.actualValue;
                  currentCount += actual.projectCount;
                });
              }
            }

            const existing = kpiAccMap.get(kpi.key);
            if (existing) {
              existing.currentValue += currentTotal;
              existing.previousValue += previousTotal;
              existing.currentProjectCount += currentCount;
              existing.previousProjectCount += previousCount;
            } else {
              kpiAccMap.set(kpi.key, {
                kpiKey: kpi.key,
                label: kpi.label,
                unit: kpi.unit,
                currentValue: currentTotal,
                previousValue: previousTotal,
                currentProjectCount: currentCount,
                previousProjectCount: previousCount,
              });
            }
          }
        } else {
          // 全期間モード: 広い範囲で一括計算（2020-01 〜 2099-12）
          const { calculateKpiMonthlyActuals } = await import('@/lib/revenue-helpers');
          for (const kpi of kpiDefs) {
            const monthlyActuals = await calculateKpiMonthlyActuals(
              prisma,
              biz.id,
              kpi,
              '2000-01',
              '2099-12',
            );

            let totalValue = 0;
            let totalCount = 0;
            for (const ma of monthlyActuals) {
              totalValue += ma.actualValue;
              totalCount += ma.projectCount;
            }

            const existing = kpiAccMap.get(kpi.key);
            if (existing) {
              existing.currentValue += totalValue;
              existing.currentProjectCount += totalCount;
            } else {
              kpiAccMap.set(kpi.key, {
                kpiKey: kpi.key,
                label: kpi.label,
                unit: kpi.unit,
                currentValue: totalValue,
                previousValue: 0,
                currentProjectCount: totalCount,
                previousProjectCount: 0,
              });
            }
          }
        }
      }),
    );

    // ============================================
    // SalesTarget から目標値を取得
    // ============================================

    const targetWhere: Record<string, unknown> = {};
    if (periodMode === 'month' && previousMonth) {
      targetWhere.targetMonth = { in: [currentMonth, previousMonth] };
    } else if (periodMode === 'range' && targetMonths) {
      targetWhere.targetMonth = { in: targetMonths };
    }
    // 全期間モード: targetMonth 条件なし（全目標合算）

    if (targetBusinessId !== null) {
      targetWhere.businessId = targetBusinessId;
    } else if (allowedIds !== null) {
      targetWhere.businessId = { in: allowedIds };
    }

    const salesTargets = await prisma.salesTarget.findMany({ where: targetWhere });

    // kpiKey → currentMonth/previousMonth のターゲット合計
    const kpiTargetMap = new Map<string, { current: number; previous: number }>();
    for (const t of salesTargets) {
      if (!t.kpiKey) continue;
      const entry = kpiTargetMap.get(t.kpiKey) ?? { current: 0, previous: 0 };
      if (periodMode === 'month') {
        if (t.targetMonth === currentMonth) {
          entry.current += Number(t.targetAmount);
        } else if (t.targetMonth === previousMonth) {
          entry.previous += Number(t.targetAmount);
        }
      } else {
        // 範囲 or 全期間: 全て current に合算
        entry.current += Number(t.targetAmount);
      }
      kpiTargetMap.set(t.kpiKey, entry);
    }

    // ============================================
    // メインカード用: 選択 KPI（または プライマリ KPI）の実績を使用
    // ============================================

    let resolvedKpiKey: string | null = null;
    if (kpiKeyParam) {
      for (const biz of businesses) {
        if (getKpiDefinition(biz.businessConfig, kpiKeyParam)) {
          resolvedKpiKey = kpiKeyParam;
          break;
        }
      }
    }
    if (!resolvedKpiKey) {
      for (const biz of businesses) {
        const primary = getPrimaryKpiDefinition(biz.businessConfig);
        if (primary) {
          resolvedKpiKey = primary.key;
          break;
        }
      }
    }

    const selectedKpiAcc = resolvedKpiKey ? kpiAccMap.get(resolvedKpiKey) : null;
    const currentRevenue = selectedKpiAcc?.currentValue ?? 0;
    const previousRevenue = selectedKpiAcc?.previousValue ?? 0;
    const currentWon = selectedKpiAcc?.currentProjectCount ?? 0;
    const previousWon = selectedKpiAcc?.previousProjectCount ?? 0;

    const selectedKpiTargets = resolvedKpiKey ? kpiTargetMap.get(resolvedKpiKey) : null;
    const currentTarget = selectedKpiTargets?.current ?? 0;
    const previousTarget = selectedKpiTargets?.previous ?? 0;

    // ============================================
    // 総案件数（projectIsActive=true）
    // ============================================

    const projectWhere: Record<string, unknown> = { projectIsActive: true };
    if (targetBusinessId !== null) {
      projectWhere.businessId = targetBusinessId;
    } else if (allowedIds !== null) {
      projectWhere.businessId = { in: allowedIds };
    }

    const currentTotalProjects = await prisma.project.count({ where: projectWhere });

    // ============================================
    // 達成率計算
    // ============================================

    const currentAchievementRate = calcAchievementRate(currentRevenue, currentTarget);
    const previousAchievementRate = calcAchievementRate(previousRevenue, previousTarget);
    const achievementChangePoints = periodMode === 'month'
      ? Math.round((currentAchievementRate - previousAchievementRate) * 10) / 10
      : 0;

    // ============================================
    // kpiSummaries（KPI別集計）
    // ============================================

    const kpiSummaries: KpiSummaryItem[] = Array.from(kpiAccMap.values()).map((acc) => {
      const targets = kpiTargetMap.get(acc.kpiKey);
      const targetAmount = targets?.current ?? 0;
      return {
        kpiKey: acc.kpiKey,
        label: acc.label,
        unit: acc.unit,
        current: acc.currentValue,
        previous: acc.previousValue,
        changeRate: periodMode === 'month' ? calcChangeRate(acc.currentValue, acc.previousValue) : 0,
        changeType: periodMode === 'month'
          ? resolveChangeType(acc.currentValue, acc.previousValue)
          : 'neutral' as const,
        targetAmount,
        achievementRate: calcAchievementRate(acc.currentValue, targetAmount),
      };
    });

    // ============================================
    // businessSummaries（会社全体モード時のみ）
    // ============================================

    let businessSummaries: BusinessSummaryItem[] | undefined;

    if (targetBusinessId === null && resolvedKpiKey) {
      // 事業別の目標合計マップ（選択KPIのみ）
      const bizTargetMap = new Map<number, number>();
      for (const t of salesTargets) {
        if (t.kpiKey !== resolvedKpiKey) continue;
        if (periodMode === 'month' && t.targetMonth !== currentMonth) continue;
        // 範囲/全期間: 全対象月の目標を合算
        bizTargetMap.set(t.businessId, (bizTargetMap.get(t.businessId) ?? 0) + Number(t.targetAmount));
      }

      // 事業ごとのKPI実績を個別に取得
      businessSummaries = await Promise.all(
        businesses.map(async (biz) => {
          const kpiDefs = getKpiDefinitions(biz.businessConfig);
          const kpiDef = kpiDefs.find((k) => k.key === resolvedKpiKey);

          let actualAmount = 0;
          let projectCount = 0;

          if (kpiDef) {
            if (targetMonths) {
              const monthsForBiz = periodMode === 'month' ? [currentMonth] : targetMonths;
              const batchResult = await calculateKpiBatchForBusiness(
                prisma,
                biz.id,
                [kpiDef],
                monthsForBiz,
              );
              const monthMap = batchResult.get(kpiDef.key);
              if (monthMap) {
                Array.from(monthMap.values()).forEach((actual) => {
                  actualAmount += actual.actualValue;
                  projectCount += actual.projectCount;
                });
              }
            } else {
              // 全期間モード
              const { calculateKpiMonthlyActuals } = await import('@/lib/revenue-helpers');
              const monthlyActuals = await calculateKpiMonthlyActuals(
                prisma,
                biz.id,
                kpiDef,
                '2000-01',
                '2099-12',
              );
              for (const ma of monthlyActuals) {
                actualAmount += ma.actualValue;
                projectCount += ma.projectCount;
              }
            }
          }

          const targetAmount = bizTargetMap.get(biz.id) ?? 0;
          const achievementRate = targetAmount > 0 ? calcAchievementRate(actualAmount, targetAmount) : null;

          return {
            businessId: biz.id,
            businessName: biz.businessName,
            actualAmount,
            targetAmount,
            achievementRate,
            projectCount,
          };
        }),
      );
    }

    // ============================================
    // レスポンス構築
    // ============================================

    const summary: DashboardSummary = {
      currentMonth,
      revenue: {
        current: currentRevenue,
        previous: previousRevenue,
        changeRate: periodMode === 'month' ? calcChangeRate(currentRevenue, previousRevenue) : 0,
        changeType: periodMode === 'month'
          ? resolveChangeType(currentRevenue, previousRevenue)
          : 'neutral' as const,
      },
      achievementRate: {
        current: currentAchievementRate,
        previous: previousAchievementRate,
        changePoints: achievementChangePoints,
        changeType: periodMode === 'month'
          ? resolveChangeType(currentAchievementRate, previousAchievementRate)
          : 'neutral' as const,
      },
      totalProjects: {
        current: currentTotalProjects,
        previous: currentTotalProjects,
        change: 0,
        changeType: 'neutral' as const,
      },
      wonProjects: {
        current: currentWon,
        previous: previousWon,
        change: periodMode === 'month' ? currentWon - previousWon : 0,
        changeType: periodMode === 'month'
          ? resolveChangeType(currentWon, previousWon)
          : 'neutral' as const,
      },
      ...(kpiSummaries.length > 0 && { kpiSummaries }),
      ...(businessSummaries !== undefined && { businessSummaries }),
    };

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return handleApiError(error);
  }
}
