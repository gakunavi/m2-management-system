'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SalesStatusFilter } from '@/components/features/project/sales-status-filter';
import { ExpectedCloseMonthFilter } from '@/components/features/project/expected-close-month-filter';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

interface StatusOption {
  statusCode: string;
  statusLabel: string;
  statusColor: string | null;
}

interface CustomFieldFilter {
  key: string;
  value: string;
}

interface Props {
  statusDefinitions: StatusOption[];
  selectedStatuses: string[];
  onStatusChange: (statuses: string[]) => void;
  monthFrom: string | null;
  monthTo: string | null;
  onMonthChange: (from: string | null, to: string | null) => void;
  /** テキスト検索（顧客名・代理店名・案件番号） */
  searchText?: string;
  onSearchChange?: (text: string) => void;
  /** カスタムフィールドフィルター */
  filterableFields?: ProjectFieldDefinition[];
  customFieldFilters?: CustomFieldFilter[];
  onCustomFieldFilterChange?: (filters: CustomFieldFilter[]) => void;
}

export function ProjectFilterPanel({
  statusDefinitions,
  selectedStatuses,
  onStatusChange,
  monthFrom,
  monthTo,
  onMonthChange,
  searchText,
  onSearchChange,
  filterableFields,
  customFieldFilters,
  onCustomFieldFilterChange,
}: Props) {
  const [localSearch, setLocalSearch] = useState(searchText ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // searchText prop が外から変わった場合に同期
  useEffect(() => {
    setLocalSearch(searchText ?? '');
  }, [searchText]);

  const handleSearchInput = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange?.(value);
    }, 300);
  };

  const hasFilterableFields = filterableFields && filterableFields.length > 0;
  const activeCustomFilters = (customFieldFilters ?? []).filter((f) => f.value);

  const handleCustomFieldChange = (key: string, value: string) => {
    const current = customFieldFilters ?? [];
    const existing = current.find((f) => f.key === key);
    let updated: CustomFieldFilter[];
    if (existing) {
      updated = value ? current.map((f) => (f.key === key ? { ...f, value } : f)) : current.filter((f) => f.key !== key);
    } else {
      updated = value ? [...current, { key, value }] : current;
    }
    onCustomFieldFilterChange?.(updated);
  };

  return (
    <div className="bg-card rounded-lg border p-3 sm:p-4 space-y-4">
      {/* テキスト検索 */}
      {onSearchChange && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">検索</p>
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={localSearch}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="顧客名・代理店名・案件番号で検索"
              className="pl-9 h-9"
            />
          </div>
        </div>
      )}

      {statusDefinitions.length > 0 && (
        <SalesStatusFilter
          statusDefinitions={statusDefinitions}
          selectedStatuses={selectedStatuses}
          onStatusChange={onStatusChange}
        />
      )}
      <ExpectedCloseMonthFilter
        monthFrom={monthFrom}
        monthTo={monthTo}
        onChange={onMonthChange}
      />

      {/* カスタムフィールドフィルター */}
      {hasFilterableFields && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            絞り込み
            {activeCustomFilters.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                {activeCustomFilters.length}
              </span>
            )}
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filterableFields!.map((field) => {
                const currentValue = (customFieldFilters ?? []).find((f) => f.key === field.key)?.value ?? '';

                if (field.type === 'select') {
                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                      <select
                        value={currentValue}
                        onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">すべて</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (field.type === 'checkbox') {
                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                      <select
                        value={currentValue}
                        onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">すべて</option>
                        <option value="true">あり</option>
                        <option value="false">なし</option>
                      </select>
                    </div>
                  );
                }

                // text / textarea / number / etc.
                return (
                  <div key={field.key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                    <Input
                      value={currentValue}
                      onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                      placeholder={`${field.label}で検索`}
                      className="h-9"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
