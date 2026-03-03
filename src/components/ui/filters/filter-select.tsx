'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFilterOptions } from '@/hooks/use-filter-options';
import type { FilterDef } from '@/types/config';

interface FilterSelectProps {
  filter: Extract<FilterDef, { type: 'select' }>;
  value: string;
  onChange: (value: string) => void;
}

export function FilterSelect({ filter, value, onChange }: FilterSelectProps) {
  const staticOptions = filter.options ?? [];
  const endpoint = filter.optionsEndpoint ? filter.optionsEndpoint : undefined;
  const { options: dynamicOptions, loading } = useFilterOptions(endpoint, filter.key);

  const options = staticOptions.length > 0 ? staticOptions : dynamicOptions;

  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <label className="text-xs font-medium text-muted-foreground leading-none">
        {filter.label}
      </label>
      <Select
        value={value || '__all__'}
        onValueChange={(v) => onChange(v === '__all__' ? '' : v)}
        disabled={loading}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="すべて" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">すべて</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
