import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getBusinessIdsForUser, getMonthLabel } from '@/lib/revenue-helpers';
import {
  parseDashboardPeriod,
  periodMonthRange,
  periodLabelMonth,
} from '@/lib/dashboard-period';
import {
  calculateBusinessMonthlyPL,
  sumMonthlyPL,
  type MonthlyPL,
} from '@/lib/profit-helpers';
import type {
  ProfitResponse,
  ProfitTotals,
  ProfitMonth,
  ProfitBusinessItem,
} from '@/types/dashboard';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/dashboard/profit
// ============================================
//
// 自社売上・代理店報酬・粗利を返す。
// 期間パラメータは /dashboard/summary と同じ（month / startMonth+endMonth / period=all）。
//
// 計上基準はダッシュボードの売上KPI（プライマリKPI）と同じ:
// 同じ金額フィールドを取扱高とし、同じ日付フィールドで月に割り当て、
// 同じ営業ステータス条件で母集団を決める。ダッシュボードは見込みを見る画面なので、
// 収益確定日（支払明細の締めに使う確定ベース）には依存させない。
//
// 自社取り分（businessConfig.rewardConfig.companyShare）が未設定の事業は
// 「自社売上0」ではなく集計対象外として扱う。全事業が未設定なら enabled=false を返し、
// 画面側は収益セクションを表示しない（設定前に粗利がマイナスに見えるのを防ぐ）。

/** 月バケットをマージ（複数事業をまたいだ合算） */
function mergeMonths(target: Map<string, MonthlyPL>, months: MonthlyPL[]): void {
  for (const m of months) {
    const cur = target.get(m.month);
    if (!cur) {
      target.set(m.month, { ...m });
      continue;
    }
    cur.gmv += m.gmv;
    cur.companyRevenue += m.companyRevenue;
    cur.rewardDirect += m.rewardDirect;
    cur.rewardIndirect += m.rewardIndirect;
    cur.rewardTotal += m.rewardTotal;
    cur.grossProfit += m.grossProfit;
    cur.projectCount += m.projectCount;
    cur.grossMargin =
      cur.companyRevenue === 0 ? null : Math.round((cur.grossProfit / cur.companyRevenue) * 1000) / 10;
  }
}

function toTotals(months: MonthlyPL[]): ProfitTotals {
  const t = sumMonthlyPL(months);
  return {
    gmv: t.gmv,
    companyRevenue: t.companyRevenue,
    rewardDirect: t.rewardDirect,
    rewardIndirect: t.rewardIndirect,
    rewardTotal: t.rewardTotal,
    grossProfit: t.grossProfit,
    grossMargin: t.grossMargin,
    projectCount: t.projectCount,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const period = parseDashboardPeriod(searchParams);
    const { from, to } = periodMonthRange(period);

    // アクセス可能な事業に限定
    const allowedIds = await getBusinessIdsForUser(prisma, user);
    const businessIdParam = searchParams.get('businessId');
    let targetBusinessId: number | null = null;
    if (businessIdParam) {
      targetBusinessId = parseInt(businessIdParam, 10);
      if (isNaN(targetBusinessId)) throw ApiError.badRequest('businessId は整数で指定してください');
      if (allowedIds !== null && !allowedIds.includes(targetBusinessId)) throw ApiError.forbidden();
    }

    const businessWhere: Record<string, unknown> = { businessIsActive: true };
    if (targetBusinessId !== null) {
      businessWhere.id = targetBusinessId;
    } else if (allowedIds !== null) {
      businessWhere.id = { in: allowedIds };
    }

    const businesses = await prisma.business.findMany({
      where: businessWhere,
      select: { id: true, businessName: true },
      orderBy: { businessSortOrder: 'asc' },
    });

    // 単月モードでは前月ぶんも必要なので、計算レンジを1ヶ月広げて後で切り分ける
    const calcFrom = period.mode === 'month' ? period.previousMonth : from;

    const perBusiness = await Promise.all(
      businesses.map(async (biz) => ({
        biz,
        months: await calculateBusinessMonthlyPL(prisma, biz.id, calcFrom, to),
      })),
    );

    const configured = perBusiness.filter((r) => r.months !== null);
    if (configured.length === 0) {
      const empty = toTotals([]);
      const response: ProfitResponse = {
        enabled: false,
        currentMonth: periodLabelMonth(period),
        months: [],
        totals: empty,
        previous: null,
      };
      return NextResponse.json({ success: true, data: response });
    }

    // 対象期間内の月だけを残す（単月モードで広げた前月を除外）
    const inPeriod = (m: MonthlyPL) => m.month >= from && m.month <= to;

    const merged = new Map<string, MonthlyPL>();
    for (const r of configured) {
      mergeMonths(merged, (r.months as MonthlyPL[]).filter(inPeriod));
    }
    const months: ProfitMonth[] = Array.from(merged.values())
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
      .map((m) => ({ ...m, monthLabel: getMonthLabel(m.month) }));

    // 前月（単月モードのみ）
    let previous: ProfitTotals | null = null;
    if (period.mode === 'month') {
      const prevMerged = new Map<string, MonthlyPL>();
      for (const r of configured) {
        mergeMonths(
          prevMerged,
          (r.months as MonthlyPL[]).filter((m) => m.month === period.previousMonth),
        );
      }
      previous = toTotals(Array.from(prevMerged.values()));
    }

    // 事業別内訳（会社全体モードのみ）
    let businessBreakdown: ProfitBusinessItem[] | undefined;
    if (targetBusinessId === null) {
      businessBreakdown = configured.map((r) => ({
        businessId: r.biz.id,
        businessName: r.biz.businessName,
        ...toTotals((r.months as MonthlyPL[]).filter(inPeriod)),
      }));
    }

    const response: ProfitResponse = {
      enabled: true,
      currentMonth: periodLabelMonth(period),
      months,
      totals: toTotals(months),
      previous,
      ...(businessBreakdown !== undefined && { businesses: businessBreakdown }),
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
