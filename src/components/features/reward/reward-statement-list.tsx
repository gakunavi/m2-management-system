'use client';

import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { RewardStatementListItem } from '@/types/reward';

interface Props {
  data: RewardStatementListItem[];
  isLoading?: boolean;
}

export function RewardStatementList({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card animate-pulse">
        <div className="p-4">
          <div className="h-5 w-40 bg-muted rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">確定済み明細書</h3>
        <p className="text-xs text-muted-foreground mt-1">この事業で確定した支払明細書の一覧です</p>
      </div>
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr className="border-b bg-muted">
              <th className="text-left p-3 font-medium">対象月</th>
              <th className="text-left p-3 font-medium">代理店</th>
              <th className="text-left p-3 font-medium">明細書番号</th>
              <th className="text-right p-3 font-medium">合計（税込）</th>
              <th className="text-left p-3 font-medium">確定日時</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  確定済みの明細書はまだありません
                </td>
              </tr>
            )}
            {data.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-3">{s.periodMonth}</td>
                <td className="p-3">
                  <div className="font-medium">{s.partnerName}</div>
                  <div className="text-xs text-muted-foreground">{s.partnerCode}</div>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{s.statementNo}</td>
                <td className="text-right p-3 font-medium">{formatCurrency(s.grandTotal)}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {formatDate(s.confirmedAt)} {s.confirmedByName ?? ''}
                </td>
                <td className="p-3 text-right">
                  <Link href={`/rewards/statements/${s.id}`} className="text-primary hover:underline text-xs">
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
