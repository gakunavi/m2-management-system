'use client';

import { ListFilter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  FilterSelect,
  FilterMultiSelect,
  FilterText,
  FilterDateRange,
  FilterNumberRange,
  FilterBoolean,
  FilterCheckboxGroup,
} from '@/components/ui/filters';
import type { FilterDef } from '@/types/config';

// ============================================
// タイプ別ディスパッチ
// ============================================

function FilterRenderer({
  filter,
  value,
  onChange,
}: {
  filter: FilterDef;
  value: string;
  onChange: (value: string) => void;
}) {
  switch (filter.type) {
    case 'select':
      return <FilterSelect filter={filter} value={value} onChange={onChange} />;
    case 'multi-select':
      return <FilterMultiSelect filter={filter} value={value} onChange={onChange} />;
    case 'text':
      return <FilterText filter={filter} value={value} onChange={onChange} />;
    case 'date-range':
      return <FilterDateRange filter={filter} value={value} onChange={onChange} />;
    case 'number-range':
      return <FilterNumberRange filter={filter} value={value} onChange={onChange} />;
    case 'boolean':
      return <FilterBoolean filter={filter} value={value} onChange={onChange} />;
    case 'checkbox-group':
      return <FilterCheckboxGroup filter={filter} value={value} onChange={onChange} />;
    case 'date':
    case 'month': {
      const inputType = filter.type === 'month' ? 'month' : 'date';
      return (
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground leading-none">
            {filter.label}
          </label>
          <input
            type={inputType}
            className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    }
    default:
      return null;
  }
}

// ============================================
// FilterPanel 本体（Popover 方式）
// ============================================

interface FilterPanelProps {
  filters: FilterDef[];
  activeFilters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearAll: () => void;
}

export function FilterPanel({
  filters,
  activeFilters,
  onFilterChange,
  onClearAll,
}: FilterPanelProps) {
  if (filters.length === 0) return null;

  const activeCount = Object.values(activeFilters).filter((v) => v !== '').length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ListFilter className="h-4 w-4" />
          絞り込み
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] sm:w-[480px] p-0">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-medium">絞り込み</span>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-3 w-3" />
              クリア
            </Button>
          )}
        </div>

        {/* フィルター一覧（2列グリッド） */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          {filters.map((filter) => {
            const isWide =
              filter.type === 'date-range' ||
              filter.type === 'number-range' ||
              filter.type === 'checkbox-group';
            return (
              <div key={filter.key} className={isWide ? 'col-span-2' : undefined}>
                <FilterRenderer
                  filter={filter}
                  value={activeFilters[filter.key] ?? ''}
                  onChange={(v) => onFilterChange(filter.key, v)}
                />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 後方互換エイリアス */
export const FilterBar = FilterPanel;
