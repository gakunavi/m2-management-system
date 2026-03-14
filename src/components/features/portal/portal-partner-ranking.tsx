'use client';

import { formatKpiValue } from '@/components/features/dashboard/chart-config';
import type { PartnerRankingResponse } from '@/types/dashboard';

interface Props {
  data: PartnerRankingResponse | undefined;
  isLoading?: boolean;
  mode: 'staff' | 'subordinate';
  onModeChange: (mode: 'staff' | 'subordinate') => void;
  hasSubordinates?: boolean;
}

export function PortalPartnerRanking({ data, isLoading, mode, onModeChange, hasSubordinates }: Props) {
  const chartLabel = data?.kpiLabel ? ` — ${data.kpiLabel}` : '';
  const baseTitle = mode === 'staff' ? 'スタッフ別ランキング' : '代理店別ランキング';
  const title = `${baseTitle}${chartLabel}`;

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        {hasSubordinates && (
          <div className="flex gap-1 p-0.5 bg-muted rounded-md">
            <button
              className={`px-2 py-1 text-xs rounded transition-colors ${
                mode === 'subordinate'
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onModeChange('subordinate')}
            >
              下位代理店
            </button>
            <button
              className={`px-2 py-1 text-xs rounded transition-colors ${
                mode === 'staff'
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onModeChange('staff')}
            >
              自社スタッフ
            </button>
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      ) : data.rankings.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          データがありません
        </div>
      ) : (
        <RankingList rankings={data.rankings} kpiUnit={data.kpiUnit} />
      )}
    </div>
  );
}

function RankingList({ rankings, kpiUnit }: { rankings: PartnerRankingResponse['rankings']; kpiUnit?: string }) {
  const maxAmount = rankings[0]?.totalAmount || 1;

  return (
    <div className="space-y-2.5">
      {rankings.map((item) => {
        const barWidth = (item.totalAmount / maxAmount) * 100;

        return (
          <div key={item.partnerId ?? 'none'} className="flex items-center gap-3">
            <span className="w-6 text-sm font-medium text-muted-foreground text-right">
              {item.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm truncate">{item.partnerName}</span>
                <span className="text-sm font-medium ml-2 shrink-0">
                  {formatKpiValue(item.totalAmount, kpiUnit, true)}
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
  );
}
