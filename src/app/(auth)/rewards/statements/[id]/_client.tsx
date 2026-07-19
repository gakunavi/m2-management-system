'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import type { RewardStatementDetail } from '@/types/reward';

interface Props {
  id: string;
}

const KIND_LABELS = { shot: 'ショット', stock: 'ストック' } as const;
const ENTRY_TYPE_LABELS = { direct: '直紹介', indirect: '間接' } as const;

export function RewardStatementDetailClient({ id }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['rewards', 'statements', 'detail', id],
    queryFn: () => apiClient.get<RewardStatementDetail>(`/rewards/statements/${id}`),
  });

  if (isLoading || !data) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="報酬明細書"
        breadcrumbs={[{ label: '報酬管理', href: '/rewards' }, { label: data.statementNo ?? `#${data.id}` }]}
        actions={
          <Button asChild size="sm" variant="outline">
            <a href={`/api/v1/rewards/statements/${data.id}/xlsx`} download>
              <Download className="h-4 w-4 mr-1.5" />
              xlsxダウンロード
            </a>
          </Button>
        }
      />

      <div className="rounded-lg border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">事業</div>
          <div className="font-medium">{data.businessName}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">代理店</div>
          <div className="font-medium">
            {data.partnerName} <span className="text-xs text-muted-foreground">{data.partnerCode}</span>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">対象月</div>
          <div className="font-medium">{data.periodMonth}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">確定日時</div>
          <div className="font-medium">
            {formatDate(data.confirmedAt)} {data.confirmedByName ?? ''}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold">明細行</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="border-b bg-muted">
                <th className="text-left p-3 font-medium">案件</th>
                <th className="text-left p-3 font-medium">発生月</th>
                <th className="text-left p-3 font-medium">種別</th>
                <th className="text-right p-3 font-medium">基準額</th>
                <th className="text-right p-3 font-medium">率/額</th>
                <th className="text-right p-3 font-medium">報酬額</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    明細がありません（¥0の明細書です）
                  </td>
                </tr>
              )}
              {data.entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{e.projectNoSnapshot ?? '-'}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.customerNameSnapshot ?? '-'}
                      {e.entryType === 'indirect' && e.sourcePartnerName && <span> （{e.sourcePartnerName} 経由）</span>}
                    </div>
                  </td>
                  <td className="p-3">{e.sourceMonth}</td>
                  <td className="p-3">
                    {KIND_LABELS[e.rewardKind]} / {ENTRY_TYPE_LABELS[e.entryType]}
                  </td>
                  <td className="text-right p-3">{formatCurrency(e.baseAmount)}</td>
                  <td className="text-right p-3">{e.rewardType === 'rate' ? `${e.rate}%` : formatCurrency(e.rewardAmount)}</td>
                  <td className="text-right p-3 font-medium">{formatCurrency(e.rewardAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">直紹介 合計</div>
            <div className="font-medium">{formatCurrency(data.totalDirect)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">間接 合計</div>
            <div className="font-medium">{formatCurrency(data.totalIndirect)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">消費税</div>
            <div className="font-medium">{formatCurrency(data.taxAmount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">合計（税込）</div>
            <div className="font-semibold">{formatCurrency(data.grandTotal)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
