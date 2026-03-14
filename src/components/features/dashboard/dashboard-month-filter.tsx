'use client';

import { memo, useMemo, useCallback } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentMonth } from '@/lib/revenue-helpers';

export type PeriodMode = 'month' | 'all' | 'range';

export interface PeriodFilter {
  mode: PeriodMode;
  month: string;       // 'month' モード用
  startMonth: string;  // 'range' モード用（必須）
  endMonth: string;    // 'range' モード用（空文字 = 上限なし）
}

export function getDefaultPeriodFilter(): PeriodFilter {
  const m = getCurrentMonth();
  return { mode: 'month', month: m, startMonth: m, endMonth: '' };
}

/** PeriodFilter → API クエリパラメータ文字列（先頭 & 付き） */
export function buildPeriodParams(filter: PeriodFilter): string {
  switch (filter.mode) {
    case 'month':
      return `&month=${filter.month}`;
    case 'range': {
      let params = `&startMonth=${filter.startMonth}`;
      if (filter.endMonth) {
        params += `&endMonth=${filter.endMonth}`;
      }
      return params;
    }
    case 'all':
      return '&period=all';
  }
}

interface Props {
  value: PeriodFilter;
  onChange: (filter: PeriodFilter) => void;
}

const MODE_OPTIONS: { value: PeriodMode; label: string }[] = [
  { value: 'month', label: '単月' },
  { value: 'all', label: '全期間' },
  { value: 'range', label: '期間指定' },
];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

/** 年の選択肢を生成（現在年 ± 3年） */
function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear - 3; y <= currentYear + 3; y++) {
    years.push(y);
  }
  return years;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

/** YYYY-MM 形式から { year, month } に分解 */
function parseYearMonth(ym: string): { year: string; month: string } {
  const [y, m] = ym.split('-');
  return { year: y, month: String(parseInt(m, 10)) };
}

/** year, month → YYYY-MM 形式に結合 */
function toYearMonth(year: string, month: string): string {
  return `${year}-${month.padStart(2, '0')}`;
}

/** YYYY-MM を1ヶ月前後に移動 */
function shiftMonth(ym: string, delta: -1 | 1): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ============================================
// 年月セレクトコンポーネント
// ============================================

function YearMonthSelect({
  value,
  onChange,
  yearOptions,
}: {
  value: string;
  onChange: (ym: string) => void;
  yearOptions: number[];
}) {
  const parsed = useMemo(() => parseYearMonth(value || getCurrentMonth()), [value]);

  return (
    <div className="inline-flex items-center gap-1">
      <select
        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={parsed.year}
        onChange={(e) => onChange(toYearMonth(e.target.value, parsed.month))}
      >
        {yearOptions.map((y) => (
          <option key={y} value={String(y)}>
            {y}年
          </option>
        ))}
      </select>
      <select
        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={parsed.month}
        onChange={(e) => onChange(toYearMonth(parsed.year, e.target.value))}
      >
        {MONTH_OPTIONS.map((m) => (
          <option key={m} value={String(m)}>
            {m}月
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================
// メインコンポーネント
// ============================================

export const DashboardMonthFilter = memo(function DashboardMonthFilter({
  value,
  onChange,
}: Props) {
  const currentMonth = getCurrentMonth();
  const yearOptions = useMemo(() => getYearOptions(), []);

  const handleModeChange = (mode: PeriodMode) => {
    if (mode === value.mode) return;
    onChange({ ...value, mode });
  };

  const statusLabel = (() => {
    switch (value.mode) {
      case 'month':
        return `${formatMonthLabel(value.month)}のデータを表示中`;
      case 'all':
        return '全期間のデータを表示中';
      case 'range': {
        const start = formatMonthLabel(value.startMonth);
        if (!value.endMonth) return `${start} 以降のデータを表示中`;
        return `${start} 〜 ${formatMonthLabel(value.endMonth)} のデータを表示中`;
      }
    }
  })();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />

      {/* モード切替ボタン */}
      <div className="inline-flex rounded-md border border-input overflow-hidden">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`px-3 py-1.5 text-sm transition-colors ${
              value.mode === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
            onClick={() => handleModeChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 単月ピッカー */}
      {value.mode === 'month' && (
        <div className="inline-flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onChange({ ...value, month: shiftMonth(value.month, -1) })}
            aria-label="前月"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <YearMonthSelect
            value={value.month}
            onChange={(ym) => onChange({ ...value, month: ym })}
            yearOptions={yearOptions}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onChange({ ...value, month: shiftMonth(value.month, 1) })}
            aria-label="翌月"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {value.month !== currentMonth && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...value, month: currentMonth })}
            >
              当月に戻す
            </Button>
          )}
        </div>
      )}

      {/* 期間指定ピッカー */}
      {value.mode === 'range' && (
        <div className="flex items-center gap-1.5">
          <YearMonthSelect
            value={value.startMonth}
            onChange={(ym) => onChange({ ...value, startMonth: ym })}
            yearOptions={yearOptions}
          />
          <span className="text-sm text-muted-foreground">〜</span>
          <YearMonthSelect
            value={value.endMonth || currentMonth}
            onChange={(ym) => onChange({ ...value, endMonth: ym })}
            yearOptions={yearOptions}
          />
          {value.endMonth && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...value, endMonth: '' })}
            >
              終了月クリア
            </Button>
          )}
        </div>
      )}

      <span className="text-sm text-muted-foreground">
        {statusLabel}
      </span>
    </div>
  );
});
