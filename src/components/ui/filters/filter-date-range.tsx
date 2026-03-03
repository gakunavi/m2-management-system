'use client';

import { serializeRange, deserializeRange } from '@/lib/filter-utils';
import type { FilterDef } from '@/types/config';

interface FilterDateRangeProps {
  filter: Extract<FilterDef, { type: 'date-range' }>;
  value: string;
  onChange: (value: string) => void;
}

export function FilterDateRange({ filter, value, onChange }: FilterDateRangeProps) {
  const { from, to } = deserializeRange(value);

  const handleFrom = (v: string) => onChange(serializeRange(v, to));
  const handleTo = (v: string) => onChange(serializeRange(from, v));

  return (
    <div className="flex flex-col gap-1 min-w-[280px]">
      <label className="text-xs font-medium text-muted-foreground leading-none">
        {filter.label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={from}
          onChange={(e) => handleFrom(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">〜</span>
        <input
          type="date"
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={to}
          onChange={(e) => handleTo(e.target.value)}
        />
      </div>
    </div>
  );
}
