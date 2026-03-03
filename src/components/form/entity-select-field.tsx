'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntitySelectConfig } from '@/types/config';

interface EntitySelectFieldProps {
  value: number | null;
  onChange: (id: number | null) => void;
  config: EntitySelectConfig;
  error?: string;
  disabled?: boolean;
  id?: string;
}

interface EntityOption {
  id: number;
  label: string;
  code?: string;
}

export function EntitySelectField({ value, onChange, config, error, disabled, id }: EntitySelectFieldProps) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayLabel, setDisplayLabel] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 選択中の値のラベルを取得
  useEffect(() => {
    if (!value) {
      setDisplayLabel('');
      return;
    }
    // 既にoptionsの中に該当があれば使う
    const found = options.find((o) => o.id === value);
    if (found) {
      setDisplayLabel(found.code ? `${found.label} (${found.code})` : found.label);
    } else {
      // APIで取得
      fetch(`/api/v1${config.endpoint}/${value}`)
        .then((r) => r.json())
        .then((json) => {
          const data = json.data;
          if (data) {
            const label = String(data[config.labelField] ?? '');
            const code = config.codeField ? String(data[config.codeField] ?? '') : '';
            setDisplayLabel(code ? `${label} (${code})` : label);
          }
        })
        .catch(() => setDisplayLabel(String(value)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const fetchOptions = useCallback(
    async (q: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ search: q, pageSize: '20' });
        const res = await fetch(`/api/v1${config.endpoint}?${params.toString()}`);
        const json = await res.json();
        const items: EntityOption[] = (json.data ?? []).map((item: Record<string, unknown>) => ({
          id: item.id as number,
          label: String(item[config.labelField] ?? ''),
          code: config.codeField ? String(item[config.codeField] ?? '') : undefined,
        }));
        setOptions(items);
      } catch {
        setOptions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [config]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchOptions(q), 300);
  };

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    if (options.length === 0) {
      fetchOptions('');
    }
  };

  const handleSelect = (opt: EntityOption) => {
    onChange(opt.id);
    setDisplayLabel(opt.code ? `${opt.label} (${opt.code})` : opt.label);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setDisplayLabel('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* トリガー */}
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer text-left',
          'ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          disabled && 'cursor-not-allowed opacity-50',
          error && 'border-destructive',
        )}
      >
        <span className={cn('flex-1 truncate', !displayLabel && 'text-muted-foreground')}>
          {displayLabel || (config.searchPlaceholder ?? 'エンティティを選択...')}
        </span>
        <span className="flex items-center gap-1">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent"
              onClick={handleClear}
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {/* ドロップダウン */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-2">
            <Input
              autoFocus
              placeholder="検索..."
              value={search}
              onChange={handleSearchChange}
              className="h-8 text-sm"
            />
          </div>
          <div
            role="listbox"
            className="max-h-60 overflow-y-auto py-1"
          >
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">読み込み中...</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {search ? '該当なし' : 'データがありません'}
              </div>
            ) : (
              options.map((opt) => (
                <div
                  key={opt.id}
                  role="option"
                  aria-selected={opt.id === value}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent',
                    opt.id === value && 'bg-accent',
                  )}
                >
                  <span className="flex-1">{opt.label}</span>
                  {opt.code && (
                    <span className="text-xs text-muted-foreground">{opt.code}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
