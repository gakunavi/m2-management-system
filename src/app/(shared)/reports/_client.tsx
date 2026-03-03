'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useBusiness } from '@/hooks/use-business';
import { getCurrentMonth } from '@/lib/revenue-helpers';
import { PageHeader } from '@/components/layout/page-header';
import { ReportMonthSelector } from '@/components/features/report/report-month-selector';
import { ReportKpiSummaryCards } from '@/components/features/report/report-kpi-summary';
import { ReportStatusBreakdownTable } from '@/components/features/report/report-status-breakdown';
import { ReportProjectList } from '@/components/features/report/report-project-list';
import type { PartnerMonthlyReportResponse } from '@/types/report';

export function ReportsClient() {
  const [month, setMonth] = useState(getCurrentMonth);
  const { businesses, selectedBusinessId, hasHydrated } = useBusiness();

  // 事業未選択時は先頭の事業を使う
  const businessId = selectedBusinessId ?? businesses[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'partner-monthly', month, businessId],
    queryFn: () =>
      apiClient.get<PartnerMonthlyReportResponse>(
        `/reports/partner-monthly?month=${month}&businessId=${businessId}`,
      ),
    enabled: hasHydrated && !!businessId,
  });

  if (!hasHydrated) return null;

  if (!businessId) {
    return (
      <div className="space-y-6">
        <PageHeader title="月次レポート" />
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          事業が登録されていません
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="月次レポート"
        actions={<ReportMonthSelector month={month} onChange={setMonth} />}
      />

      {/* 事業名 */}
      {data && !isLoading && (
        <p className="text-sm text-muted-foreground">
          事業: <span className="font-medium text-foreground">{data.businessName}</span>
        </p>
      )}

      {/* KPI サマリー */}
      <ReportKpiSummaryCards data={data?.kpiSummaries ?? []} isLoading={isLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ステータス別内訳 */}
        <ReportStatusBreakdownTable
          data={data?.statusBreakdown ?? []}
          totalCount={data?.totalProjectCount ?? 0}
          totalAmount={data?.totalAmount ?? 0}
          isLoading={isLoading}
        />

        {/* 案件一覧 */}
        <ReportProjectList projects={data?.projects ?? []} isLoading={isLoading} />
      </div>
    </div>
  );
}
