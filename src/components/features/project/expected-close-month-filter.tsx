'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'single' | 'range';

interface Props {
  monthFrom: string | null;
  monthTo: string | null;
  onChange: (from: string | null, to: string | null) => void;
}

function detectInitialMode(from: string | null, to: string | null): FilterMode {
  if (!from && !to) return 'all';
  if (from && to && from !== to) return 'range';
  return 'single';
}

export function ExpectedCloseMonthFilter({ monthFrom, monthTo, onChange }: Props) {
  const [mode, setMode] = useState<FilterMode>(() => detectInitialMode(monthFrom, monthTo));

  const handleModeChange = (newMode: FilterMode) => {
    setMode(newMode);
    if (newMode === 'all') {
      onChange(null, null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">受注予定月で絞り込み</p>
      <div className="flex flex-wrap items-center gap-2">
        {/* モード切替ボタン */}
        <button
          type="button"
          onClick={() => handleModeChange('all')}
          className={cn(
            'px-3 py-1 text-xs rounded-full font-medium transition-all border',
            mode === 'all'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-muted border-transparent hover:bg-muted/80',
          )}
        >
          すべて
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('single')}
          className={cn(
            'px-3 py-1 text-xs rounded-full font-medium transition-all border',
            mode === 'single'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-muted border-transparent hover:bg-muted/80',
          )}
        >
          単月
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('range')}
          className={cn(
            'px-3 py-1 text-xs rounded-full font-medium transition-all border',
            mode === 'range'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-muted border-transparent hover:bg-muted/80',
          )}
        >
          期間指定
        </button>

        {/* 月選択UI */}
        {mode === 'single' && (
          <input
            type="month"
            value={monthFrom ?? ''}
            onChange={(e) => {
              const val = e.target.value || null;
              onChange(val, val);
            }}
            className="h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        )}
        {mode === 'range' && (
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={monthFrom ?? ''}
              onChange={(e) => onChange(e.target.value || null, monthTo)}
              className="h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="text-xs text-muted-foreground">〜</span>
            <input
              type="month"
              value={monthTo ?? ''}
              onChange={(e) => onChange(monthFrom, e.target.value || null)}
              className="h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}
      </div>
    </div>
  );
}
