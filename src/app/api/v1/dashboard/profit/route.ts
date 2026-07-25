import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  getBusinessIdsForUser,
  getMonthLabel,
  getFiscalYearMonths,
  getFiscalYearFromMonth,
} from '@/lib/revenue-helpers';
import {
  parseDashboardPeriod,
  periodMonthRange,
  periodLabelMonth,
} from '@/lib/dashboard-period';
import {
  calculateBusinessMonthlyPL,
  calculateBusinessProjectPL,
  sumMonthlyPL,
  type MonthlyPL,
} from '@/lib/profit-helpers';
import type {
  ProfitResponse,
  ProfitTotals,
  ProfitMonth,
  ProfitBusinessItem,
  ProfitProjectRow,
} from '@/types/dashboard';

/** 案件別内訳の返却上限。突き合わせが目的なので全件は返さない */
const PROJECT_ROW_LIMIT = 100;

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/dashboard/profit
// ============================================
//
// 自社売上・代理店支払手数料・粗利を返す。
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

    // グラフは期間フィルターに関係なく年度（4月開始12ヶ月）で描く。
    // 上部のKPI推移グラフと同じ見え方に揃えるため。カードの数字は期間フィルター基準のまま。
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : getFiscalYearFromMonth(periodLabelMonth(period));
    if (isNaN(year)) throw ApiError.badRequest('year は整数で指定してください');
    const fiscalMonths = getFiscalYearMonths(year);
    const fiscalFrom = fiscalMonths[0];
    const fiscalTo = fiscalMonths[fiscalMonths.length - 1];

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

    // カード用（期間）とグラフ用（年度）の両方をまかなえるレンジで1回だけ計算し、
    // あとから切り分ける。事業ごとに2回まわすとDBアクセスが倍になるため
    const loadFrom = calcFrom < fiscalFrom ? calcFrom : fiscalFrom;
    const loadTo = to > fiscalTo ? to : fiscalTo;

    const perBusiness = await Promise.all(
      businesses.map(async (biz) => ({
        biz,
        months: await calculateBusinessMonthlyPL(prisma, biz.id, loadFrom, loadTo),
        // 案件別内訳は表示期間ぶんだけでよい（前月・年度に広げる必要は無い）
        projects: await calculateBusinessProjectPL(prisma, biz.id, from, to),
      })),
    );

    const configured = perBusiness.filter((r) => r.months !== null);
    if (configured.length === 0) {
      const empty = toTotals([]);
      const response: ProfitResponse = {
        enabled: false,
        currentMonth: periodLabelMonth(period),
        year,
        months: [],
        highlightMonth: null,
        totals: empty,
        previous: null,
        projects: [],
      };
      return NextResponse.json({ success: true, data: response });
    }

    // 対象期間内の月だけを残す（単月モードで広げた前月・年度ぶんを除外）
    const inPeriod = (m: MonthlyPL) => m.month >= from && m.month <= to;

    // カード用: 期間フィルターの合計
    const periodMerged = new Map<string, MonthlyPL>();
    for (const r of configured) {
      mergeMonths(periodMerged, (r.months as MonthlyPL[]).filter(inPeriod));
    }

    // グラフ用: 年度の12ヶ月。実績が無い月も0で埋めて必ず12本並べる
    const fiscalMerged = new Map<string, MonthlyPL>();
    for (const r of configured) {
      mergeMonths(
        fiscalMerged,
        (r.months as MonthlyPL[]).filter((m) => m.month >= fiscalFrom && m.month <= fiscalTo),
      );
    }
    const months: ProfitMonth[] = fiscalMonths.map((month) => {
      const m = fiscalMerged.get(month);
      return {
        month,
        monthLabel: getMonthLabel(month),
        gmv: m?.gmv ?? 0,
        companyRevenue: m?.companyRevenue ?? 0,
        rewardDirect: m?.rewardDirect ?? 0,
        rewardIndirect: m?.rewardIndirect ?? 0,
        rewardTotal: m?.rewardTotal ?? 0,
        grossProfit: m?.grossProfit ?? 0,
        grossMargin: m?.grossMargin ?? null,
        projectCount: m?.projectCount ?? 0,
      };
    });

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

    // 案件別内訳（金額の大きい順。事業をまたぐ場合も合算して並べる）
    const projectRows: ProfitProjectRow[] = configured
      .flatMap((r) => r.projects ?? [])
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, PROJECT_ROW_LIMIT);

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
      year,
      months,
      highlightMonth: period.mode === 'month' ? period.month : null,
      // カードは期間フィルター基準（グラフの年度とは別軸）
      totals: toTotals(Array.from(periodMerged.values())),
      previous,
      ...(businessBreakdown !== undefined && { businesses: businessBreakdown }),
      projects: projectRows,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
