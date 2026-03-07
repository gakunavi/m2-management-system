import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
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

    // 月パラメータのバリデーション
    const currentMonth = monthParam ?? getCurrentMonth();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(currentMonth)) {
      throw ApiError.badRequest('month は YYYY-MM 形式で指定してください');
    }
    const previousMonth = getPreviousMonth(currentMonth);

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
    // kpiKey 指定時はその KPI、未指定時はプライマリ KPI を使用
    // ============================================

    // 各事業の KPI 定義を収集し、kpiKey でユニーク化して集計
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

    // 各事業の KPI 実績を一括計算（N+1 クエリ回避: 事業ごとに 1 クエリ）
    await Promise.all(
      businesses.map(async (biz) => {
        const kpiDefs = getKpiDefinitions(biz.businessConfig);
        if (kpiDefs.length === 0) return;

        const batchResult = await calculateKpiBatchForBusiness(
          prisma,
          biz.id,
          kpiDefs,
          [currentMonth, previousMonth],
        );

        for (const kpi of kpiDefs) {
          const monthMap = batchResult.get(kpi.key);
          const currentActual = monthMap?.get(currentMonth) || { actualValue: 0, projectCount: 0 };
          const previousActual = monthMap?.get(previousMonth) || { actualValue: 0, projectCount: 0 };

          const existing = kpiAccMap.get(kpi.key);
          if (existing) {
            existing.currentValue += currentActual.actualValue;
            existing.previousValue += previousActual.actualValue;
            existing.currentProjectCount += currentActual.projectCount;
            existing.previousProjectCount += previousActual.projectCount;
          } else {
            kpiAccMap.set(kpi.key, {
              kpiKey: kpi.key,
              label: kpi.label,
              unit: kpi.unit,
              currentValue: currentActual.actualValue,
              previousValue: previousActual.actualValue,
              currentProjectCount: currentActual.projectCount,
              previousProjectCount: previousActual.projectCount,
            });
          }
        }
      }),
    );

    // ============================================
    // SalesTarget から目標値を取得
    // ============================================

    const targetWhere: Record<string, unknown> = {
      targetMonth: { in: [currentMonth, previousMonth] },
    };
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
      if (t.targetMonth === currentMonth) {
        entry.current += Number(t.targetAmount);
      } else if (t.targetMonth === previousMonth) {
        entry.previous += Number(t.targetAmount);
      }
      kpiTargetMap.set(t.kpiKey, entry);
    }

    // ============================================
    // メインカード用: 選択 KPI（または プライマリ KPI）の実績を使用
    // ============================================

    // 選択 KPI の kpiKey を解決
    let resolvedKpiKey: string | null = null;
    if (kpiKeyParam) {
      // 指定 KPI が存在するか確認
      for (const biz of businesses) {
        if (getKpiDefinition(biz.businessConfig, kpiKeyParam)) {
          resolvedKpiKey = kpiKeyParam;
          break;
        }
      }
    }
    if (!resolvedKpiKey) {
      // プライマリ KPI を使用
      for (const biz of businesses) {
        const primary = getPrimaryKpiDefinition(biz.businessConfig);
        if (primary) {
          resolvedKpiKey = primary.key;
          break;
        }
      }
    }

    // 選択 KPI の実績を取得
    const selectedKpiAcc = resolvedKpiKey ? kpiAccMap.get(resolvedKpiKey) : null;
    const currentRevenue = selectedKpiAcc?.currentValue ?? 0;
    const previousRevenue = selectedKpiAcc?.previousValue ?? 0;
    const currentWon = selectedKpiAcc?.currentProjectCount ?? 0;
    const previousWon = selectedKpiAcc?.previousProjectCount ?? 0;

    // 選択 KPI の目標
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
    const achievementChangePoints = Math.round((currentAchievementRate - previousAchievementRate) * 10) / 10;

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
        changeRate: calcChangeRate(acc.currentValue, acc.previousValue),
        changeType: resolveChangeType(acc.currentValue, acc.previousValue),
        targetAmount,
        achievementRate: calcAchievementRate(acc.currentValue, targetAmount),
      };
    });

    // ============================================
    // businessSummaries（会社全体モード時のみ）
    // ============================================

    let businessSummaries: BusinessSummaryItem[] | undefined;

    if (targetBusinessId === null && resolvedKpiKey) {
      // 事業別の目標月額マップ（選択KPIのみ）
      const bizTargetMap = new Map<number, number>();
      for (const t of salesTargets) {
        if (t.targetMonth === currentMonth && t.kpiKey === resolvedKpiKey) {
          bizTargetMap.set(t.businessId, (bizTargetMap.get(t.businessId) ?? 0) + Number(t.targetAmount));
        }
      }

      // 事業ごとのKPI実績を個別に取得
      businessSummaries = await Promise.all(
        businesses.map(async (biz) => {
          const kpiDefs = getKpiDefinitions(biz.businessConfig);
          const kpiDef = kpiDefs.find((k) => k.key === resolvedKpiKey);

          let actualAmount = 0;
          let projectCount = 0;

          if (kpiDef) {
            const batchResult = await calculateKpiBatchForBusiness(
              prisma,
              biz.id,
              [kpiDef],
              [currentMonth],
            );
            const monthMap = batchResult.get(kpiDef.key);
            const actual = monthMap?.get(currentMonth);
            actualAmount = actual?.actualValue ?? 0;
            projectCount = actual?.projectCount ?? 0;
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
        changeRate: calcChangeRate(currentRevenue, previousRevenue),
        changeType: resolveChangeType(currentRevenue, previousRevenue),
      },
      achievementRate: {
        current: currentAchievementRate,
        previous: previousAchievementRate,
        changePoints: achievementChangePoints,
        changeType: resolveChangeType(currentAchievementRate, previousAchievementRate),
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
        change: currentWon - previousWon,
        changeType: resolveChangeType(currentWon, previousWon),
      },
      ...(kpiSummaries.length > 0 && { kpiSummaries }),
      ...(businessSummaries !== undefined && { businessSummaries }),
    };

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return handleApiError(error);
  }
}
