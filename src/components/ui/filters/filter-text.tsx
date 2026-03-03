'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import type { FilterDef } from '@/types/config';

interface FilterTextProps {
  filter: Extract<FilterDef, { type: 'text' }>;
  value: string;
  onChange: (value: string) => void;
}

export function FilterText({ filter, value, onChange }: FilterTextProps) {
  const debounceMs = filter.debounceMs ?? 500;
  const [local, setLocal] = useState(value);

  // 外部から値がリセットされた場合に同期
  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) {
        onChange(local);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [local, debounceMs, onChange, value]);

  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <label className="text-xs font-medium text-muted-foreground leading-none">
        {filter.label}
      </label>
      <Input
        type="text"
        className="h-8 text-sm"
        placeholder={filter.placeholder ?? `${filter.label}を入力...`}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
}
