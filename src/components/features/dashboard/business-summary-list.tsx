'use client';

import { formatKpiValue } from './chart-config';
import { useBusiness } from '@/hooks/use-business';
import type { BusinessSummaryItem } from '@/types/dashboard';

interface Props {
  data: BusinessSummaryItem[] | undefined;
  isLoading?: boolean;
  kpiUnit?: string;
}

export function BusinessSummaryList({ data, isLoading, kpiUnit }: Props) {
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

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold mb-4">事業別サマリー</h3>

      <div className="space-y-3">
        {data.map((biz) => {
          const rate = biz.achievementRate;
          const barWidth = rate !== null ? Math.min(100, rate) : 0;

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
                <span>
                  {formatKpiValue(biz.actualAmount, kpiUnit, true)} / {formatKpiValue(biz.targetAmount, kpiUnit, true)}
                </span>
                <span className={rate !== null && rate >= 100 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                  {rate !== null ? `${rate.toFixed(1)}%` : '-'}
                </span>
              </div>

              {/* プログレスバー */}
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: rate !== null && rate >= 100 ? '#22c55e' : '#3b82f6',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
