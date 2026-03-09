'use client';

import { formatKpiValue } from '@/components/features/dashboard/chart-config';
import type { ReportKpiSummary } from '@/types/report';

interface Props {
  data: ReportKpiSummary[];
  isLoading?: boolean;
}

function formatValue(value: number, unit: string): string {
  return formatKpiValue(value, unit, true);
}

export function ReportKpiSummaryCards({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 animate-pulse">
            <div className="h-4 w-20 bg-muted rounded mb-3" />
            <div className="h-7 w-32 bg-muted rounded mb-2" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
      {data.map((kpi) => (
        <div key={kpi.kpiKey} className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">{kpi.label}</p>
          <p className="text-2xl font-bold mt-1">{formatValue(kpi.actual, kpi.unit)}</p>
          <p className="text-xs text-muted-foreground mt-2">
            対象案件 {kpi.projectCount.toLocaleString()}件
          </p>
        </div>
      ))}
    </div>
  );
}
