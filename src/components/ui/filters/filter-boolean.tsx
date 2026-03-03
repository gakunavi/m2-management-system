'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FilterDef } from '@/types/config';

interface FilterBooleanProps {
  filter: Extract<FilterDef, { type: 'boolean' }>;
  value: string;
  onChange: (value: string) => void;
}

export function FilterBoolean({ filter, value, onChange }: FilterBooleanProps) {
  const trueLabel = filter.trueLabel ?? 'はい';
  const falseLabel = filter.falseLabel ?? 'いいえ';

  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <label className="text-xs font-medium text-muted-foreground leading-none">
        {filter.label}
      </label>
      <Select
        value={value || '__all__'}
        onValueChange={(v) => onChange(v === '__all__' ? '' : v)}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="すべて" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">すべて</SelectItem>
          <SelectItem value="true">{trueLabel}</SelectItem>
          <SelectItem value="false">{falseLabel}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
