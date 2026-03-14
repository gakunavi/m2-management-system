'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'single' | 'range';

interface Props {
  monthFrom: string | null;
  monthTo: string | null;
  onChange: (from: string | null, to: string | null) => void;
}

function detectInitialMode(from: string | null, to: string | null): FilterMode {
  if (!from && !to) return 'all';
  if (from && to && from !== to) return 'range';
  return 'single';
}

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseYearMonth(value: string | null): { year: string; month: string } {
  if (!value) {
    const current = getCurrentMonth();
    const [y, m] = current.split('-');
    return { year: y, month: m };
  }
  const [y, m] = value.split('-');
  return { year: y, month: m };
}

function toYearMonth(year: string, month: string): string {
  return `${year}-${month}`;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: `${i + 1}月`,
}));

function getYearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const years: { value: string; label: string }[] = [];
  for (let y = currentYear - 2; y <= currentYear + 5; y++) {
    years.push({ value: String(y), label: `${y}年` });
  }
  return years;
}

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer';

interface MonthSelectProps {
  value: string | null;
  onChange: (value: string) => void;
}

function MonthSelect({ value, onChange }: MonthSelectProps) {
  const { year, month } = parseYearMonth(value);
  const yearOptions = getYearOptions();

  return (
    <div className="flex items-center gap-1">
      <select
        value={year}
        onChange={(e) => onChange(toYearMonth(e.target.value, month))}
        className={selectClass}
      >
        {yearOptions.map((y) => (
          <option key={y.value} value={y.value}>
            {y.label}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onChange(toYearMonth(year, e.target.value))}
        className={selectClass}
      >
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ExpectedCloseMonthFilter({ monthFrom, monthTo, onChange }: Props) {
  const [mode, setMode] = useState<FilterMode>(() => detectInitialMode(monthFrom, monthTo));

  const handleModeChange = (newMode: FilterMode) => {
    setMode(newMode);
    if (newMode === 'all') {
      onChange(null, null);
    } else if (newMode === 'single') {
      const defaultMonth = monthFrom || getCurrentMonth();
      onChange(defaultMonth, defaultMonth);
    } else if (newMode === 'range') {
      const defaultFrom = monthFrom || getCurrentMonth();
      onChange(defaultFrom, monthTo);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">受注予定月で絞り込み</p>
      <div className="flex flex-wrap items-center gap-2">
        {/* モード切替ボタン */}
        <button
          type="button"
          onClick={() => handleModeChange('all')}
          className={cn(
            'px-3 py-1 text-xs rounded-full font-medium transition-all border',
            mode === 'all'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-muted border-transparent hover:bg-muted/80',
          )}
        >
          すべて
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('single')}
          className={cn(
            'px-3 py-1 text-xs rounded-full font-medium transition-all border',
            mode === 'single'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-muted border-transparent hover:bg-muted/80',
          )}
        >
          単月
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('range')}
          className={cn(
            'px-3 py-1 text-xs rounded-full font-medium transition-all border',
            mode === 'range'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-muted border-transparent hover:bg-muted/80',
          )}
        >
          期間指定
        </button>

        {/* 月選択UI */}
        {mode === 'single' && (
          <MonthSelect
            value={monthFrom}
            onChange={(val) => onChange(val, val)}
          />
        )}
        {mode === 'range' && (
          <div className="flex items-center gap-2">
            <MonthSelect
              value={monthFrom}
              onChange={(val) => onChange(val, monthTo)}
            />
            <span className="text-xs text-muted-foreground">〜</span>
            <MonthSelect
              value={monthTo}
              onChange={(val) => onChange(monthFrom, val)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
