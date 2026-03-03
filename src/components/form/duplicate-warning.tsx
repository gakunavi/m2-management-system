'use client';

import { AlertTriangle, Ban, Loader2 } from 'lucide-react';
import type { DuplicateCandidate } from '@/hooks/use-duplicate-check';

interface DuplicateWarningProps {
  candidates: DuplicateCandidate[];
  isChecking: boolean;
  entityLabel?: string;
  /** 完全一致が見つかった場合（ブロッキング対象） */
  isExactComboMatch?: boolean;
}

export function DuplicateWarning({
  candidates,
  isChecking,
  entityLabel = 'データ',
  isExactComboMatch,
}: DuplicateWarningProps) {
  if (isChecking) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>類似{entityLabel}を確認中...</span>
      </div>
    );
  }

  if (candidates.length === 0) return null;

  // 完全一致 → 赤色のブロッキング警告
  if (isExactComboMatch) {
    return (
      <div className="mt-1 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
        <div className="flex items-start gap-2">
          <Ban className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">
              同名+同電話番号の{entityLabel}が既に存在します（登録できません）
            </p>
            <ul className="mt-1 space-y-0.5">
              {candidates.map((c) => (
                <li key={c.id} className="text-destructive/80 truncate">
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // 類似 → 黄色の警告（従来の動作）
  return (
    <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            類似する{entityLabel}が{candidates.length}件あります
          </p>
          <ul className="mt-1 space-y-0.5">
            {candidates.map((c) => (
              <li key={c.id} className="text-amber-700 dark:text-amber-300 truncate">
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
