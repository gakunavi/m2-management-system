'use client';

import { formatCurrency } from '@/lib/utils';
import type { RewardPartnerSummary } from '@/types/reward';

interface Props {
  data: RewardPartnerSummary[];
  grandTotal: { directTotal: number; indirectTotal: number; total: number };
  selectedPartnerId: number | null;
  onSelectPartner: (partnerId: number) => void;
  isLoading?: boolean;
}

export function RewardPartnerSummaryTable({ data, grandTotal, selectedPartnerId, onSelectPartner, isLoading }: Props) {
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

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">代理店別 報酬集計</h3>
        <p className="text-xs text-muted-foreground mt-1">行をクリックすると明細を表示します</p>
      </div>
      <div className="overflow-auto max-h-[calc(100vh-400px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr className="border-b bg-muted">
              <th className="text-left p-3 font-medium">代理店</th>
              <th className="text-right p-3 font-medium">直紹介</th>
              <th className="text-right p-3 font-medium">間接</th>
              <th className="text-right p-3 font-medium">合計</th>
              <th className="text-right p-3 font-medium">件数</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  対象月に確定した報酬案件がありません
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr
                key={row.partnerId}
                onClick={() => onSelectPartner(row.partnerId)}
                className={`border-b last:border-0 cursor-pointer hover:bg-muted/50 ${
                  selectedPartnerId === row.partnerId ? 'bg-muted/70' : ''
                }`}
              >
                <td className="p-3">
                  <div className="font-medium">{row.partnerName}</div>
                  <div className="text-xs text-muted-foreground">{row.partnerCode}</div>
                </td>
                <td className="text-right p-3">{formatCurrency(row.directTotal)}</td>
                <td className="text-right p-3">{formatCurrency(row.indirectTotal)}</td>
                <td className="text-right p-3 font-medium">{formatCurrency(row.total)}</td>
                <td className="text-right p-3">{row.entryCount.toLocaleString()}件</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className="p-3">合計</td>
              <td className="text-right p-3">{formatCurrency(grandTotal.directTotal)}</td>
              <td className="text-right p-3">{formatCurrency(grandTotal.indirectTotal)}</td>
              <td className="text-right p-3">{formatCurrency(grandTotal.total)}</td>
              <td className="text-right p-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
