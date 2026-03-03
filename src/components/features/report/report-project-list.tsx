'use client';

import Link from 'next/link';
import { formatCurrency } from '@/components/features/dashboard/chart-config';
import type { ReportProject } from '@/types/report';

interface Props {
  projects: ReportProject[];
  isLoading?: boolean;
}

export function ReportProjectList({ projects, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card animate-pulse">
        <div className="p-4">
          <div className="h-5 w-32 bg-muted rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
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
        <h3 className="font-semibold">案件一覧</h3>
      </div>
      {projects.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          該当月の案件はありません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">案件番号</th>
                <th className="text-left p-3 font-medium">顧客名</th>
                <th className="text-left p-3 font-medium">ステータス</th>
                <th className="text-right p-3 font-medium">金額</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {p.projectNo}
                    </Link>
                  </td>
                  <td className="p-3">{p.customerName ?? '-'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {p.statusColor && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.statusColor }}
                        />
                      )}
                      <span>{p.statusLabel ?? p.projectSalesStatus}</span>
                    </div>
                  </td>
                  <td className="text-right p-3">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
