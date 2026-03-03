import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  getCurrentMonth,
  getPreviousMonth,
  calculateMonthRevenue,
  getBusinessIdsForUser,
  getRevenueRecognition,
  getKpiDefinitions,
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
    // 売上金額集計（当月・前月）
    // ============================================

    let currentRevenue = 0;
    let previousRevenue = 0;

    // 売上計上ルールがある事業IDのリスト
    const businessesWithRR = businesses
      .map((biz) => ({ ...biz, rr: getRevenueRecognition(biz.businessConfig) }))
      .filter((biz) => biz.rr !== null) as Array<{
      id: number;
      businessName: string;
      businessConfig: unknown;
      rr: NonNullable<ReturnType<typeof getRevenueRecognition>>;
    }>;

    // 当月・前月の売上を並列集計
    const revenueResults = await Promise.all(
      businessesWithRR.map(async (biz) => {
        const [current, previous] = await Promise.all([
          calculateMonthRevenue(prisma, biz.id, biz.rr, currentMonth),
          calculateMonthRevenue(prisma, biz.id, biz.rr, previousMonth),
        ]);
        return { biz, current, previous };
      }),
    );

    for (const { current, previous } of revenueResults) {
      currentRevenue += current.actualAmount;
      previousRevenue += previous.actualAmount;
    }

    // ============================================
    // 総案件数（projectIsActive=true）
    // ============================================

    const projectWhere: Record<string, unknown> = { projectIsActive: true };
    if (targetBusinessId !== null) {
      projectWhere.businessId = targetBusinessId;
    } else if (allowedIds !== null) {
      projectWhere.businessId = { in: allowedIds };
    }

    // 案件数（projectIsActive=true の現在スナップショット）
    // 注: totalProjects は active 案件の現時点のカウント。
    // 前月比較は won(受注)件数で月フィールド識別する設計のため、同一値を使用。
    const currentTotalProjects = await prisma.project.count({ where: projectWhere });

    // ============================================
    // 受注案件数（wonProjects）集計
    // ============================================
    // 各事業の revenueRecognition.statusCode を持つプロジェクトを
    // dateField が currentMonth / previousMonth に一致するもので集計

    let currentWon = 0;
    let previousWon = 0;

    for (const { current, previous } of revenueResults) {
      currentWon += current.projectCount;
      previousWon += previous.projectCount;
    }

    // ============================================
    // 達成率: SalesTarget との照合
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

    // 達成率: プライマリ KPI（revenue）の目標のみ使用（全KPI合算を避ける）
    let currentTarget = 0;
    let previousTarget = 0;
    for (const t of salesTargets) {
      // revenueRecognition ベースの既存4カード用 → 'revenue' kpiKey の目標のみ集計
      if (t.kpiKey !== 'revenue') continue;
      if (t.targetMonth === currentMonth) {
        currentTarget += Number(t.targetAmount);
      } else if (t.targetMonth === previousMonth) {
        previousTarget += Number(t.targetAmount);
      }
    }

    const currentAchievementRate = calcAchievementRate(currentRevenue, currentTarget);
    const previousAchievementRate = calcAchievementRate(previousRevenue, previousTarget);
    const achievementChangePoints = Math.round((currentAchievementRate - previousAchievementRate) * 10) / 10;

    // ============================================
    // kpiSummaries（KPI別集計）
    // ============================================

    // 各事業の KPI 定義を収集し、kpiKey でユニーク化して集計
    interface KpiAccumulator {
      kpiKey: string;
      label: string;
      unit: string;
      currentValue: number;
      previousValue: number;
      targetAmount: number;
    }

    const kpiAccMap = new Map<string, KpiAccumulator>();

    // KPI ターゲットレコードを kpiKey でフィルタリングするため先に取得済みの salesTargets を再利用
    // kpiKey を持つ SalesTarget レコードのみ集計対象
    const kpiTargetMap = new Map<string, number>(); // `${kpiKey}` → currentMonth のターゲット合計
    for (const t of salesTargets) {
      if (t.targetMonth === currentMonth && t.kpiKey) {
        kpiTargetMap.set(t.kpiKey, (kpiTargetMap.get(t.kpiKey) ?? 0) + Number(t.targetAmount));
      }
    }

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
          } else {
            kpiAccMap.set(kpi.key, {
              kpiKey: kpi.key,
              label: kpi.label,
              unit: kpi.unit,
              currentValue: currentActual.actualValue,
              previousValue: previousActual.actualValue,
              targetAmount: 0,
            });
          }
        }
      }),
    );

    // ターゲット金額をマージしてレスポンス配列を構築
    const kpiSummaries: KpiSummaryItem[] = Array.from(kpiAccMap.values()).map((acc) => {
      const targetAmount = kpiTargetMap.get(acc.kpiKey) ?? 0;
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

    if (targetBusinessId === null) {
      // 事業別の目標月額マップ（プライマリKPIのみ）
      const bizTargetMap = new Map<number, number>();
      for (const t of salesTargets) {
        if (t.targetMonth === currentMonth && t.kpiKey === 'revenue') {
          bizTargetMap.set(t.businessId, (bizTargetMap.get(t.businessId) ?? 0) + Number(t.targetAmount));
        }
      }

      businessSummaries = businesses.map((biz) => {
        const rrResult = revenueResults.find((r) => r.biz.id === biz.id);
        const actualAmount = rrResult?.current.actualAmount ?? 0;
        const projectCount = rrResult?.current.projectCount ?? 0;
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
      });
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
