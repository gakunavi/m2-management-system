import { ApiError } from '@/lib/error-handler';
import { getCurrentMonth, getPreviousMonth } from '@/lib/revenue-helpers';

// ============================================
// ダッシュボードの期間パラメータ解釈
// ============================================
//
// クエリの受け方は既存の /dashboard/summary と揃える:
//   period=all                  全期間（前月比較なし）
//   startMonth[&endMonth]       範囲（前月比較なし）
//   month / 未指定              単月（前月比較あり。既定は当月）

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 集計の下限。これより前の会計データは扱わない（ストック展開の暴走防止） */
const EARLIEST_MONTH = '2000-01';

export type DashboardPeriod =
  | { mode: 'month'; month: string; previousMonth: string }
  | { mode: 'range'; startMonth: string; endMonth: string }
  | { mode: 'all'; endMonth: string };

export function parseDashboardPeriod(searchParams: URLSearchParams): DashboardPeriod {
  const periodParam = searchParams.get('period');
  const startMonthParam = searchParams.get('startMonth');
  const endMonthParam = searchParams.get('endMonth');
  const monthParam = searchParams.get('month');

  if (periodParam === 'all') {
    // 未来のストック売上はまだ発生していないので、上限は当月で打ち切る
    return { mode: 'all', endMonth: getCurrentMonth() };
  }

  if (startMonthParam) {
    if (!MONTH_PATTERN.test(startMonthParam)) {
      throw ApiError.badRequest('startMonth は YYYY-MM 形式で指定してください');
    }
    if (endMonthParam && !MONTH_PATTERN.test(endMonthParam)) {
      throw ApiError.badRequest('endMonth は YYYY-MM 形式で指定してください');
    }
    // endMonth 省略時は当月まで。startMonth より前になる場合は startMonth に丸める
    const fallbackEnd = getCurrentMonth();
    const endMonth = endMonthParam ?? (fallbackEnd < startMonthParam ? startMonthParam : fallbackEnd);
    return { mode: 'range', startMonth: startMonthParam, endMonth };
  }

  const month = monthParam ?? getCurrentMonth();
  if (!MONTH_PATTERN.test(month)) {
    throw ApiError.badRequest('month は YYYY-MM 形式で指定してください');
  }
  return { mode: 'month', month, previousMonth: getPreviousMonth(month) };
}

/** 集計対象の月レンジ（inclusive）。ストック展開の上限にもなるので必ず有限にする */
export function periodMonthRange(period: DashboardPeriod): { from: string; to: string } {
  switch (period.mode) {
    case 'month':
      return { from: period.month, to: period.month };
    case 'range':
      return { from: period.startMonth, to: period.endMonth };
    case 'all':
      return { from: EARLIEST_MONTH, to: period.endMonth };
  }
}

/** 表示ラベル用の代表月 */
export function periodLabelMonth(period: DashboardPeriod): string {
  return period.mode === 'month' ? period.month : period.endMonth;
}
