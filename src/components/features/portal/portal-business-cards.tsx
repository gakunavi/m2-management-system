'use client';

import { formatKpiValue } from '@/components/features/dashboard/chart-config';
import { useBusiness } from '@/hooks/use-business';
import type { PortalBusinessSummary } from '@/types/dashboard';

interface Props {
  data: PortalBusinessSummary[] | undefined;
  isLoading?: boolean;
}

export function PortalBusinessCards({ data, isLoading }: Props) {
  const { switchBusiness } = useBusiness();

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">事業別サマリー</h3>
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">事業別サマリー</h3>
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          データがありません
        </div>
      </div>
    );
  }

  const maxAmount = Math.max(...data.map((b) => b.totalAmount), 1);

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold mb-4">事業別サマリー</h3>

      <div className="space-y-3">
        {data.map((biz) => {
          const barWidth = (biz.totalAmount / maxAmount) * 100;

          return (
            <div
              key={biz.businessId}
              className="cursor-pointer rounded-md p-3 hover:bg-muted/50 transition-colors"
              onClick={() => switchBusiness(biz.businessId)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{biz.businessName}</span>
                <span className="text-xs text-muted-foreground">{biz.projectCount}件</span>
              </div>

              <div className="flex items-center justify-between text-sm mb-1">
                <span>{formatKpiValue(biz.totalAmount, biz.kpiUnit, true)}</span>
                <span className="text-muted-foreground">受注 {biz.wonProjectCount}件</span>
              </div>

              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
