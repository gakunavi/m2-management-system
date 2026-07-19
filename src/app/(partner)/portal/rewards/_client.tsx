'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Banknote } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useBusiness } from '@/hooks/use-business';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { PortalRewardResponse } from '@/types/reward';

const KIND_LABELS = { shot: 'ショット', stock: 'ストック' } as const;
const ENTRY_TYPE_LABELS = { direct: '直紹介', indirect: '間接' } as const;

export function PortalRewardsClient() {
  const router = useRouter();
  const { selectedBusinessId, hasHydrated } = useBusiness();

  useEffect(() => {
    if (hasHydrated && !selectedBusinessId) {
      router.replace('/portal');
    }
  }, [hasHydrated, selectedBusinessId, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['portal', 'rewards', selectedBusinessId],
    queryFn: () => apiClient.get<PortalRewardResponse>(`/portal/rewards?businessId=${selectedBusinessId}`),
    enabled: hasHydrated && !!selectedBusinessId,
  });

  if (!hasHydrated || !selectedBusinessId || isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <PageHeader title="報酬" />
      {!data ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-6">
          {/* 当月ライブサマリー */}
          <div className="bg-card rounded-lg border p-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              {data.month} の見込み報酬
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              締め・確定前のライブ計算です。実際の金額は明細書の確定をもって確定します
            </p>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <div className="text-xs text-muted-foreground">直紹介</div>
                <div className="text-lg font-semibold">{formatCurrency(data.live.directTotal)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">間接</div>
                <div className="text-lg font-semibold">{formatCurrency(data.live.indirectTotal)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">合計</div>
                <div className="text-lg font-semibold">{formatCurrency(data.live.total)}</div>
              </div>
            </div>
          </div>

          {/* 当月の内訳 */}
          <div className="bg-card rounded-lg border">
            <div className="p-4 border-b">
              <h3 className="font-medium text-sm">{data.month} の内訳</h3>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="border-b bg-muted">
                    <th className="text-left p-3 font-medium">案件</th>
                    <th className="text-left p-3 font-medium">代理店</th>
                    <th className="text-left p-3 font-medium">種別</th>
                    <th className="text-right p-3 font-medium">報酬額</th>
                  </tr>
                </thead>
                <tbody>
                  {data.live.entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        今月の対象案件はありません
                      </td>
                    </tr>
                  )}
                  {data.live.entries.map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-3">
                        <div className="font-medium">{e.projectNo}</div>
                        <div className="text-xs text-muted-foreground">{e.customerName ?? '-'}</div>
                      </td>
                      <td className="p-3">{e.partnerName}</td>
                      <td className="p-3">
                        {KIND_LABELS[e.rewardKind]} / {ENTRY_TYPE_LABELS[e.entryType]}
                        {e.entryType === 'indirect' && e.sourcePartnerName && (
                          <span className="text-xs text-muted-foreground">（{e.sourcePartnerName} 経由）</span>
                        )}
                      </td>
                      <td className="text-right p-3 font-medium">{formatCurrency(e.rewardAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 過去の確定分 */}
          <div className="bg-card rounded-lg border">
            <div className="p-4 border-b">
              <h3 className="font-medium text-sm">確定済みの報酬</h3>
              <p className="text-xs text-muted-foreground mt-1">
                締め処理が完了した月の確定金額です。支払明細書は別途お送りします
              </p>
            </div>
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="border-b bg-muted">
                    <th className="text-left p-3 font-medium">対象月</th>
                    <th className="text-left p-3 font-medium">代理店</th>
                    <th className="text-right p-3 font-medium">直紹介</th>
                    <th className="text-right p-3 font-medium">間接</th>
                    <th className="text-right p-3 font-medium">合計（税込）</th>
                    <th className="text-left p-3 font-medium">確定日</th>
                  </tr>
                </thead>
                <tbody>
                  {data.confirmedStatements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        確定済みの報酬はまだありません
                      </td>
                    </tr>
                  )}
                  {data.confirmedStatements.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-3">{s.periodMonth}</td>
                      <td className="p-3">{s.partnerName}</td>
                      <td className="text-right p-3">{formatCurrency(s.totalDirect)}</td>
                      <td className="text-right p-3">{formatCurrency(s.totalIndirect)}</td>
                      <td className="text-right p-3 font-medium">{formatCurrency(s.grandTotal)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDate(s.confirmedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
