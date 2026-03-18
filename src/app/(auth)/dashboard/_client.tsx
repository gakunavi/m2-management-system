'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { getCurrentFiscalYear, getFiscalYearFromMonth } from '@/lib/revenue-helpers';
import { PageHeader } from '@/components/layout/page-header';
import { KpiSummaryCards } from '@/components/features/dashboard/kpi-summary-cards';
import {
  DashboardMonthFilter,
  getDefaultPeriodFilter,
  buildPeriodParams,
  type PeriodFilter,
} from '@/components/features/dashboard/dashboard-month-filter';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const RevenueTrendChart = dynamic(
  () => import('@/components/features/dashboard/revenue-trend-chart').then((m) => m.RevenueTrendChart),
  { loading: () => <Skeleton className="h-80 w-full rounded-lg" /> },
);
const PipelineChart = dynamic(
  () => import('@/components/features/dashboard/pipeline-chart').then((m) => m.PipelineChart),
  { loading: () => <Skeleton className="h-64 w-full rounded-lg" /> },
);
import { BusinessSummaryList } from '@/components/features/dashboard/business-summary-list';
import { PartnerRanking } from '@/components/features/dashboard/partner-ranking';
import { KpiTabSelector } from '@/components/features/dashboard/kpi-tab-selector';
import { BusinessDocumentSection } from '@/components/features/dashboard/business-document-section';
import { AnnouncementBanner } from '@/components/features/announcement/announcement-banner';
import { TaskDashboardWidget } from '@/components/features/dashboard/task-dashboard-widget';
import type {
  DashboardSummary,
  RevenueTrendResponse,
  PipelineResponse,
  PartnerRankingResponse,
  KpiDefinition,
} from '@/types/dashboard';

interface BusinessData {
  id: number;
  businessConfig: {
    kpiDefinitions?: KpiDefinition[];
  } | null;
}

/** PeriodFilter を queryKey 用の安定キーに変換 */
function periodQueryKey(filter: PeriodFilter): string {
  switch (filter.mode) {
    case 'month': return `month:${filter.month}`;
    case 'all': return 'all';
    case 'range': return `range:${filter.startMonth}:${filter.endMonth}`;
  }
}

function CompanyDashboard() {
  const [trendYear, setTrendYear] = useState(getCurrentFiscalYear);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(getDefaultPeriodFilter);

  // 単月モード時はグラフの年度を指定月の年度に自動連動
  const isMonthMode = periodFilter.mode === 'month';
  const effectiveTrendYear = isMonthMode ? getFiscalYearFromMonth(periodFilter.month) : trendYear;
  const highlightMonth = isMonthMode ? periodFilter.month : null;

  const periodParams = buildPeriodParams(periodFilter);
  const periodKey = periodQueryKey(periodFilter);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['dashboard', 'summary', periodKey],
    queryFn: () => apiClient.get<DashboardSummary>(`/dashboard/summary?_=1${periodParams}`),
  });

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['dashboard', 'revenue-trend', effectiveTrendYear],
    queryFn: () => apiClient.get<RevenueTrendResponse>(`/dashboard/revenue-trend?year=${effectiveTrendYear}`),
  });

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ['dashboard', 'pipeline', periodKey],
    queryFn: () => apiClient.get<PipelineResponse>(`/dashboard/pipeline?_=1${periodParams}`),
  });

  return (
    <div className="space-y-6">
      <AnnouncementBanner />

      <DashboardMonthFilter
        value={periodFilter}
        onChange={setPeriodFilter}
      />

      <KpiSummaryCards data={summary} isLoading={summaryLoading} kpiUnit={summary?.kpiSummaries?.[0]?.unit} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueTrendChart
            data={trend}
            year={effectiveTrendYear}
            onYearChange={setTrendYear}
            isLoading={trendLoading}
            highlightMonth={highlightMonth}
            hideYearSelector={isMonthMode}
          />
        </div>
        <div>
          <BusinessSummaryList
            data={summary?.businessSummaries}
            isLoading={summaryLoading}
            kpiUnit={summary?.kpiSummaries?.[0]?.unit}
          />
        </div>
      </div>

      <PipelineChart data={pipeline} isLoading={pipelineLoading} />

      <TaskDashboardWidget />
    </div>
  );
}

function BusinessDashboard({ businessId }: { businessId: number }) {
  const [trendYear, setTrendYear] = useState(getCurrentFiscalYear);
  const [selectedKpiKey, setSelectedKpiKey] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(getDefaultPeriodFilter);

  // 単月モード時はグラフの年度を指定月の年度に自動連動
  const isMonthMode = periodFilter.mode === 'month';
  const effectiveTrendYear = isMonthMode ? getFiscalYearFromMonth(periodFilter.month) : trendYear;
  const highlightMonth = isMonthMode ? periodFilter.month : null;

  // 事業のKPI定義一覧を取得
  const { data: businessData } = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => apiClient.get<BusinessData>(`/businesses/${businessId}`),
  });

  const kpiDefinitions = useMemo<KpiDefinition[]>(
    () => businessData?.businessConfig?.kpiDefinitions ?? [],
    [businessData],
  );

  // KPI定義が変わったらデフォルト選択
  useEffect(() => {
    if (kpiDefinitions.length > 0 && !selectedKpiKey) {
      const primary = kpiDefinitions.find((k) => k.isPrimary);
      setSelectedKpiKey(primary?.key ?? kpiDefinitions[0].key);
    }
  }, [kpiDefinitions, selectedKpiKey]);

  // KPIパラメータ付きでAPIを呼ぶ
  const kpiParam = selectedKpiKey ? `&kpiKey=${selectedKpiKey}` : '';
  const periodParams = buildPeriodParams(periodFilter);
  const periodKey = periodQueryKey(periodFilter);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['dashboard', 'summary', businessId, selectedKpiKey, periodKey],
    queryFn: () =>
      apiClient.get<DashboardSummary>(
        `/dashboard/summary?businessId=${businessId}${kpiParam}${periodParams}`,
      ),
  });

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['dashboard', 'revenue-trend', businessId, effectiveTrendYear, selectedKpiKey],
    queryFn: () =>
      apiClient.get<RevenueTrendResponse>(
        `/dashboard/revenue-trend?businessId=${businessId}&year=${effectiveTrendYear}${kpiParam}`,
      ),
    enabled: !!selectedKpiKey || kpiDefinitions.length === 0,
  });

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ['dashboard', 'pipeline', businessId, selectedKpiKey, periodKey],
    queryFn: () =>
      apiClient.get<PipelineResponse>(
        `/dashboard/pipeline?businessId=${businessId}${kpiParam}${periodParams}`,
      ),
    enabled: !!selectedKpiKey || kpiDefinitions.length === 0,
  });

  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['dashboard', 'partner-ranking', businessId, selectedKpiKey, periodKey],
    queryFn: () =>
      apiClient.get<PartnerRankingResponse>(
        `/dashboard/partner-ranking?businessId=${businessId}${kpiParam}${periodParams}`,
      ),
  });



  const currentKpi = kpiDefinitions.find((k) => k.key === selectedKpiKey);

  return (
    <div className="space-y-6">
      <AnnouncementBanner businessId={businessId} />

      {/* 期間フィルター */}
      <DashboardMonthFilter
        value={periodFilter}
        onChange={setPeriodFilter}
      />

      {/* KPIタブ切替 */}
      {kpiDefinitions.length > 1 && (
        <KpiTabSelector
          kpiDefinitions={kpiDefinitions}
          selectedKey={selectedKpiKey}
          onSelect={setSelectedKpiKey}
        />
      )}

      {/* KPIサマリーカード + 推移グラフを近接配置 */}
      <KpiSummaryCards data={summary} isLoading={summaryLoading} kpiUnit={currentKpi?.unit} />

      <RevenueTrendChart
        data={trend}
        year={effectiveTrendYear}
        onYearChange={setTrendYear}
        isLoading={trendLoading}
        kpiLabel={currentKpi?.label}
        kpiUnit={currentKpi?.unit}
        highlightMonth={highlightMonth}
        hideYearSelector={isMonthMode}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PipelineChart data={pipeline} isLoading={pipelineLoading} />
        <PartnerRanking data={ranking} isLoading={rankingLoading} />
      </div>

      <TaskDashboardWidget />

      {/* 資料共有（支払明細書は代理店マスタから管理） */}
      <BusinessDocumentSection
        businessId={businessId}
        documentType="material"
        title="資料共有"
        canManage
        apiBase="/businesses"
      />
    </div>
  );
}

export default function DashboardClient() {
  const router = useRouter();
  const { isPartner, isLoading: authLoading } = useAuth();
  const { selectedBusinessId, currentBusiness, hasHydrated } = useBusiness();

  // partner ロールは /portal へリダイレクト
  if (!authLoading && isPartner) {
    router.replace('/portal');
    return null;
  }

  if (!hasHydrated) return null;

  const title = selectedBusinessId && currentBusiness
    ? `ダッシュボード — ${currentBusiness.businessName}`
    : 'ダッシュボード';

  return (
    <div className="space-y-6">
      <PageHeader title={title} />

      {selectedBusinessId ? (
        <BusinessDashboard businessId={selectedBusinessId} />
      ) : (
        <CompanyDashboard />
      )}
    </div>
  );
}
