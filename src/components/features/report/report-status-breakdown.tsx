'use client';

import { formatCurrency } from '@/components/features/dashboard/chart-config';
import type { ReportStatusBreakdown } from '@/types/report';

interface Props {
  data: ReportStatusBreakdown[];
  totalCount: number;
  totalAmount: number;
  isLoading?: boolean;
}

export function ReportStatusBreakdownTable({ data, totalCount, totalAmount, isLoading }: Props) {
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
        <h3 className="font-semibold">ステータス別内訳</h3>
      </div>
      <div className="overflow-auto max-h-[calc(100vh-400px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr className="border-b bg-muted">
              <th className="text-left p-3 font-medium">ステータス</th>
              <th className="text-right p-3 font-medium">案件数</th>
              <th className="text-right p-3 font-medium">金額</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.statusCode} className="border-b last:border-0">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {row.statusColor && (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: row.statusColor }}
                      />
                    )}
                    <span>{row.statusLabel}</span>
                  </div>
                </td>
                <td className="text-right p-3">{row.projectCount.toLocaleString()}件</td>
                <td className="text-right p-3">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className="p-3">合計</td>
              <td className="text-right p-3">{totalCount.toLocaleString()}件</td>
              <td className="text-right p-3">{formatCurrency(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
