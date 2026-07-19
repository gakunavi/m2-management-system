'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/hooks/use-business';
import { getCurrentMonth } from '@/lib/revenue-helpers';
import { PageHeader } from '@/components/layout/page-header';
import { ReportMonthSelector } from '@/components/features/report/report-month-selector';
import { RewardPartnerSummaryTable } from '@/components/features/reward/reward-partner-summary-table';
import { RewardPreviewPanel } from '@/components/features/reward/reward-preview-panel';
import { RewardStatementList } from '@/components/features/reward/reward-statement-list';
import { RewardConfirmationWarningBanner } from '@/components/features/reward/reward-confirmation-warning-banner';
import type {
  RewardSummaryResponse,
  RewardPreviewResponse,
  RewardStatementListItem,
  RewardConfirmationWarning,
} from '@/types/reward';

export function RewardsClient() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const { businesses, selectedBusinessId, hasHydrated } = useBusiness();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const businessId = selectedBusinessId ?? businesses[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['rewards', 'summary', month, businessId],
    queryFn: () =>
      apiClient.get<RewardSummaryResponse>(`/rewards?businessId=${businessId}&month=${month}`),
    enabled: hasHydrated && !!businessId,
  });

  // 事業・対象月を変えたら選択中の代理店をリセット
  useEffect(() => {
    setSelectedPartnerId(null);
  }, [businessId, month]);

  const { data: previewData, isLoading: isPreviewLoading } = useQuery({
    queryKey: ['rewards', 'preview', month, businessId, selectedPartnerId],
    queryFn: () =>
      apiClient.get<RewardPreviewResponse>(
        `/rewards/preview?businessId=${businessId}&partnerId=${selectedPartnerId}&month=${month}`,
      ),
    enabled: hasHydrated && !!businessId && selectedPartnerId != null,
  });

  // 選択中の代理店×対象月が既に確定済みか（確定済みなら明細書へのリンク・バッジを表示）
  const { data: existingStatements } = useQuery({
    queryKey: ['rewards', 'statements', 'check', month, businessId, selectedPartnerId],
    queryFn: () =>
      apiClient.get<RewardStatementListItem[]>(
        `/rewards/statements?businessId=${businessId}&partnerId=${selectedPartnerId}&periodMonth=${month}`,
      ),
    enabled: hasHydrated && !!businessId && selectedPartnerId != null,
  });
  const existingStatement = existingStatements?.[0] ?? null;

  const { data: statementList, isLoading: isStatementListLoading } = useQuery({
    queryKey: ['rewards', 'statements', 'list', businessId],
    queryFn: () => apiClient.get<RewardStatementListItem[]>(`/rewards/statements?businessId=${businessId}`),
    enabled: hasHydrated && !!businessId,
  });

  // 締め前の警告: 収益確定対象ステータスなのに revenueConfirmedAt が未設定の案件（月に依存しない）
  const { data: confirmationWarnings } = useQuery({
    queryKey: ['rewards', 'warnings', businessId],
    queryFn: () => apiClient.get<RewardConfirmationWarning[]>(`/rewards/warnings?businessId=${businessId}`),
    enabled: hasHydrated && !!businessId,
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      apiClient.create(`/rewards/statements`, { businessId, partnerId: selectedPartnerId, periodMonth: month }),
    onSuccess: () => {
      toast({ message: 'この期間の報酬を確定しました', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['rewards', 'statements'] });
    },
    onError: (error: Error) => {
      toast({ message: error.message, type: 'error' });
    },
  });

  if (!hasHydrated) return null;

  if (!businessId) {
    return (
      <div className="space-y-6">
        <PageHeader title="報酬管理" />
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          事業が登録されていません
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="報酬管理"
        actions={<ReportMonthSelector month={month} onChange={setMonth} />}
      />

      <RewardConfirmationWarningBanner data={confirmationWarnings ?? []} />

      {data && !isLoading && (
        <p className="text-sm text-muted-foreground">
          事業: <span className="font-medium text-foreground">{data.businessName}</span>
          <span className="mx-2">|</span>
          支払い対象月ベースの集計です（締め・確定は別途行います）
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RewardPartnerSummaryTable
          data={data?.partners ?? []}
          grandTotal={data?.grandTotal ?? { directTotal: 0, indirectTotal: 0, total: 0 }}
          selectedPartnerId={selectedPartnerId}
          onSelectPartner={setSelectedPartnerId}
          isLoading={isLoading}
        />
        <RewardPreviewPanel
          data={previewData}
          isLoading={selectedPartnerId != null && isPreviewLoading}
          existingStatement={existingStatement}
          onConfirm={() => confirmMutation.mutate()}
          isConfirming={confirmMutation.isPending}
        />
      </div>

      <RewardStatementList data={statementList ?? []} isLoading={isStatementListLoading} />
    </div>
  );
}
