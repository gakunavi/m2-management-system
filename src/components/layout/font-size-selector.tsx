'use client';

import { useFontSize, type FontSizeKey } from '@/hooks/use-font-size';
import { cn } from '@/lib/utils';
import { Type } from 'lucide-react';

const OPTIONS: { key: FontSizeKey; label: string }[] = [
  { key: 'small', label: '小' },
  { key: 'medium', label: '中' },
  { key: 'large', label: '大' },
];

export function FontSizeSelector() {
  const { fontSize, setFontSize } = useFontSize();

  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="文字サイズ">
      <Type className="h-3.5 w-3.5 text-muted-foreground mr-0.5 hidden sm:block" />
      {OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={fontSize === key}
          aria-label={`文字サイズ: ${label}`}
          onClick={() => setFontSize(key)}
          className={cn(
            'h-7 min-w-[1.75rem] rounded px-1.5 text-xs font-medium transition-colors',
            fontSize === key
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
