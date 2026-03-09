'use client';

import { memo } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentMonth } from '@/lib/revenue-helpers';

export type PeriodMode = 'month' | 'all' | 'range';

export interface PeriodFilter {
  mode: PeriodMode;
  month: string;       // 'month' モード用
  startMonth: string;  // 'range' モード用
  endMonth: string;    // 'range' モード用
}

export function getDefaultPeriodFilter(): PeriodFilter {
  const m = getCurrentMonth();
  return { mode: 'month', month: m, startMonth: m, endMonth: m };
}

/** PeriodFilter → API クエリパラメータ文字列（先頭 & 付き） */
export function buildPeriodParams(filter: PeriodFilter): string {
  switch (filter.mode) {
    case 'month':
      return `&month=${filter.month}`;
    case 'range':
      return `&startMonth=${filter.startMonth}&endMonth=${filter.endMonth}`;
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

export const DashboardMonthFilter = memo(function DashboardMonthFilter({
  value,
  onChange,
}: Props) {
  const currentMonth = getCurrentMonth();

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
      case 'range':
        return `${formatMonthLabel(value.startMonth)} 〜 ${formatMonthLabel(value.endMonth)} のデータを表示中`;
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
        <>
          <input
            type="month"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={value.month}
            onChange={(e) => onChange({ ...value, month: e.target.value })}
          />
          {value.month !== currentMonth && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...value, month: currentMonth })}
            >
              当月に戻す
            </Button>
          )}
        </>
      )}

      {/* 期間指定ピッカー */}
      {value.mode === 'range' && (
        <div className="flex items-center gap-1.5">
          <input
            type="month"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={value.startMonth}
            onChange={(e) => onChange({ ...value, startMonth: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">〜</span>
          <input
            type="month"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={value.endMonth}
            onChange={(e) => onChange({ ...value, endMonth: e.target.value })}
          />
        </div>
      )}

      <span className="text-sm text-muted-foreground">
        {statusLabel}
      </span>
    </div>
  );
});
