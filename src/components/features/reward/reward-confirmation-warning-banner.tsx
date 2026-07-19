'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { RewardConfirmationWarning } from '@/types/reward';

interface Props {
  data: RewardConfirmationWarning[];
}

// ============================================
// 収益確定日 未設定の警告バナー
// ============================================
// 営業ステータスは「収益確定」対象だが revenueConfirmedAt が未設定の案件を警告する。
// この状態の案件は報酬計算から静かに除外される。月には依存しない（現在の状態のみ）。

export function RewardConfirmationWarningBanner({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            {data.length}件の案件で収益確定日が未設定です（報酬計算から除外されています）
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            営業ステータスは収益確定対象ですが、収益確定日が入っていません。案件詳細の「代理店報酬」タブから確定日を設定してください。
          </p>
          <ul className="mt-2 space-y-1">
            {data.map((w) => (
              <li key={w.projectId} className="text-xs">
                <Link href={`/projects/${w.projectId}`} className="text-amber-900 underline hover:no-underline">
                  {w.projectNo}
                </Link>
                <span className="text-amber-800">
                  {' '}
                  {w.customerName ?? '-'} ／ {w.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
