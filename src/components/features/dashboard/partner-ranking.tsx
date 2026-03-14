'use client';

import { memo } from 'react';
import { formatKpiValue } from './chart-config';
import type { PartnerRankingResponse } from '@/types/dashboard';

interface Props {
  data: PartnerRankingResponse | undefined;
  isLoading?: boolean;
}

export const PartnerRanking = memo(function PartnerRanking({ data, isLoading }: Props) {
  const chartLabel = data?.kpiLabel ?? '売上';
  const title = `代理店別ランキング — ${chartLabel}`;

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">代理店別ランキング</h3>
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (data.rankings.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">{title}</h3>
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          データがありません
        </div>
      </div>
    );
  }

  const maxAmount = data.rankings[0]?.totalAmount || 1;

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold mb-4">{title}</h3>

      <div className="space-y-2.5">
        {data.rankings.map((item) => {
          const barWidth = (item.totalAmount / maxAmount) * 100;

          return (
            <div key={item.partnerId ?? 'direct'} className="flex items-center gap-3">
              <span className="w-6 text-sm font-medium text-muted-foreground text-right">
                {item.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm truncate">{item.partnerName}</span>
                  <span className="text-sm font-medium ml-2 shrink-0">
                    {formatKpiValue(item.totalAmount, data.kpiUnit, true)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{item.projectCount}件</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
