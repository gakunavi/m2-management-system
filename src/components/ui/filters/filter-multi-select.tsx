'use client';

import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useFilterOptions } from '@/hooks/use-filter-options';
import { serializeMultiValue, deserializeMultiValue } from '@/lib/filter-utils';
import type { FilterDef } from '@/types/config';

interface FilterMultiSelectProps {
  filter: Extract<FilterDef, { type: 'multi-select' }>;
  value: string;
  onChange: (value: string) => void;
}

export function FilterMultiSelect({ filter, value, onChange }: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);

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

  const clearAll = () => onChange('');

  const triggerLabel =
    selected.length === 0
      ? 'すべて'
      : selected.length <= 2
        ? selected
            .map((v) => options.find((o) => o.value === v)?.label ?? v)
            .join(', ')
        : `${selected.length}件選択`;

  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <label className="text-xs font-medium text-muted-foreground leading-none">
        {filter.label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 justify-between text-sm font-normal"
            disabled={loading}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <div className="max-h-[240px] overflow-y-auto p-1">
            {options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleValue(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={clearAll}
              >
                選択をクリア
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
