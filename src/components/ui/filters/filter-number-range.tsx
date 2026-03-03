'use client';

import { Input } from '@/components/ui/input';
import { serializeRange, deserializeRange } from '@/lib/filter-utils';
import type { FilterDef } from '@/types/config';

interface FilterNumberRangeProps {
  filter: Extract<FilterDef, { type: 'number-range' }>;
  value: string;
  onChange: (value: string) => void;
}

export function FilterNumberRange({ filter, value, onChange }: FilterNumberRangeProps) {
  const { from, to } = deserializeRange(value);

  const handleFrom = (v: string) => onChange(serializeRange(v, to));
  const handleTo = (v: string) => onChange(serializeRange(from, v));

  return (
    <div className="flex flex-col gap-1 min-w-[260px]">
      <label className="text-xs font-medium text-muted-foreground leading-none">
        {filter.label}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          className="h-8 flex-1 text-sm"
          placeholder="下限"
          value={from}
          onChange={(e) => handleFrom(e.target.value)}
          min={filter.min}
          max={filter.max}
          step={filter.step}
        />
        <span className="text-xs text-muted-foreground">〜</span>
        <Input
          type="number"
          className="h-8 flex-1 text-sm"
          placeholder="上限"
          value={to}
          onChange={(e) => handleTo(e.target.value)}
          min={filter.min}
          max={filter.max}
          step={filter.step}
        />
        {filter.unit && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filter.unit}
          </span>
        )}
      </div>
    </div>
  );
}
