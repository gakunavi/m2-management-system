'use client';

import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { RewardPreviewResponse, RewardStatementListItem } from '@/types/reward';

interface Props {
  data: RewardPreviewResponse | undefined;
  isLoading?: boolean;
  existingStatement?: RewardStatementListItem | null;
  onConfirm?: () => void;
  isConfirming?: boolean;
}

const KIND_LABELS = { shot: 'ショット', stock: 'ストック' } as const;
const ENTRY_TYPE_LABELS = { direct: '直紹介', indirect: '間接' } as const;

export function RewardPreviewPanel({ data, isLoading, existingStatement, onConfirm, isConfirming }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card animate-pulse">
        <div className="p-4">
          <div className="h-5 w-40 bg-muted rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        代理店を選択すると明細を表示します
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{data.partnerName} の明細</h3>
          <p className="text-xs text-muted-foreground mt-1">
            直紹介 {formatCurrency(data.directTotal)} ／ 間接 {formatCurrency(data.indirectTotal)} ／ 合計{' '}
            {formatCurrency(data.total)}
          </p>
        </div>
        {existingStatement ? (
          <div className="text-right text-xs shrink-0">
            <span className="inline-block rounded bg-green-100 text-green-800 px-2 py-1 font-medium">確定済み</span>
            <p className="text-muted-foreground mt-1">
              {formatDate(existingStatement.confirmedAt)} {existingStatement.confirmedByName ?? ''}
            </p>
            <Link href={`/rewards/statements/${existingStatement.id}`} className="text-primary hover:underline">
              明細書を見る
            </Link>
          </div>
        ) : (
          onConfirm && (
            <Button size="sm" onClick={onConfirm} disabled={isConfirming} className="shrink-0">
              {isConfirming ? '確定中...' : 'この期間を確定する'}
            </Button>
          )
        )}
      </div>
      <div className="overflow-auto max-h-[calc(100vh-400px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr className="border-b bg-muted">
              <th className="text-left p-3 font-medium">案件</th>
              <th className="text-left p-3 font-medium">種別</th>
              <th className="text-right p-3 font-medium">基準額</th>
              <th className="text-right p-3 font-medium">率/額</th>
              <th className="text-right p-3 font-medium">報酬額</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  明細がありません
                </td>
              </tr>
            )}
            {data.entries.map((e, i) => (
              <tr key={`${e.projectId}-${e.rewardKind}-${e.entryType}-${i}`} className="border-b last:border-0">
                <td className="p-3">
                  <div className="font-medium">{e.projectNo}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.customerName ?? '-'}
                    {e.entryType === 'indirect' && e.sourcePartnerName && (
                      <span> （{e.sourcePartnerName} 経由）</span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  {KIND_LABELS[e.rewardKind]} / {ENTRY_TYPE_LABELS[e.entryType]}
                </td>
                <td className="text-right p-3">{formatCurrency(e.baseAmount)}</td>
                <td className="text-right p-3">{e.rewardType === 'rate' ? `${e.rate}%` : formatCurrency(e.rewardAmount)}</td>
                <td className="text-right p-3 font-medium">{formatCurrency(e.rewardAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
