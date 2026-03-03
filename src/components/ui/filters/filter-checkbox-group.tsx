'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { useFilterOptions } from '@/hooks/use-filter-options';
import { serializeMultiValue, deserializeMultiValue } from '@/lib/filter-utils';
import type { FilterDef } from '@/types/config';

interface FilterCheckboxGroupProps {
  filter: Extract<FilterDef, { type: 'checkbox-group' }>;
  value: string;
  onChange: (value: string) => void;
}

export function FilterCheckboxGroup({ filter, value, onChange }: FilterCheckboxGroupProps) {
  const staticOptions = filter.options ?? [];
  const endpoint = filter.optionsEndpoint ? filter.optionsEndpoint : undefined;
  const { options: dynamicOptions, loading } = useFilterOptions(endpoint, filter.key);

  const options = staticOptions.length > 0 ? staticOptions : dynamicOptions;
  const selected = deserializeMultiValue(value);

  const toggleValue = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    onChange(serializeMultiValue(next));
  };

  if (loading) return null;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground leading-none">
        {filter.label}
      </label>
      <div className="flex flex-wrap items-center gap-3 h-8 pt-0.5">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-1.5 text-sm cursor-pointer"
          >
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={() => toggleValue(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
