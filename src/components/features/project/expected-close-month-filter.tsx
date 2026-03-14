'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'single' | 'range';

interface Props {
  monthFrom: string | null;
  monthTo: string | null;
  onChange: (from: string | null, to: string | null) => void;
}

export function ExpectedCloseMonthFilter({ monthFrom, monthTo, onChange }: Props) {
  const mode: FilterMode = !monthFrom && !monthTo
    ? 'all'
    : monthFrom && monthTo && monthFrom !== monthTo
      ? 'range'
      : 'single';

  const [showRange, setShowRange] = useState(mode === 'range');

  const handleModeChange = (newMode: FilterMode) => {
    if (newMode === 'all') {
      onChange(null, null);
      setShowRange(false);
    } else if (newMode === 'single') {
      setShowRange(false);
      // Keep monthFrom if set, clear monthTo
      onChange(monthFrom, null);
    } else {
      setShowRange(true);
      // Keep monthFrom if set
      onChange(monthFrom, monthTo);
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
        {mode !== 'all' && (
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={monthFrom ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                if (showRange) {
                  onChange(val, monthTo);
                } else {
                  // 単月: from と to を同じ値に
                  onChange(val, val);
                }
              }}
              className="h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {showRange && (
              <>
                <span className="text-xs text-muted-foreground">〜</span>
                <input
                  type="month"
                  value={monthTo ?? ''}
                  onChange={(e) => onChange(monthFrom, e.target.value || null)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
