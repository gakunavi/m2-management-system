'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { getCurrentFiscalYear } from '@/lib/revenue-helpers';
import { PageHeader } from '@/components/layout/page-header';
import { KpiSummaryCards } from '@/components/features/dashboard/kpi-summary-cards';
import { KpiTabSelector } from '@/components/features/dashboard/kpi-tab-selector';
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

import { PortalBusinessCards } from '@/components/features/portal/portal-business-cards';
import { PortalPartnerRanking } from '@/components/features/portal/portal-partner-ranking';
import { BusinessDocumentSection } from '@/components/features/dashboard/business-document-section';
import { AnnouncementBanner } from '@/components/features/announcement/announcement-banner';
import type {
  DashboardSummary,
  RevenueTrendResponse,
  PipelineResponse,
  PartnerRankingResponse,
  KpiDefinition,
  PortalBusinessSummary,
} from '@/types/dashboard';

// ============================================
// Portal 用サマリーレスポンス型
// ============================================

interface PortalDashboardSummary extends DashboardSummary {
  portalBusinesses?: PortalBusinessSummary[];
  kpiDefinitions?: KpiDefinition[];
}

/** PeriodFilter を queryKey 用の安定キーに変換 */
function periodQueryKey(filter: PeriodFilter): string {
  switch (filter.mode) {
    case 'month': return `month:${filter.month}`;
    case 'all': return 'all';
    case 'range': return `range:${filter.startMonth}:${filter.endMonth}`;
  }
}

// ============================================
// 全事業ビュー
// ============================================

function PortalCompanyDashboard() {
  const [trendYear, setTrendYear] = useState(getCurrentFiscalYear);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(getDefaultPeriodFilter);

  const periodParams = buildPeriodParams(periodFilter);
  const periodKey = periodQueryKey(periodFilter);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['portal', 'summary', periodKey],
    queryFn: () => apiClient.get<PortalDashboardSummary>(`/portal/summary?_=1${periodParams}`),
  });

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['portal', 'revenue-trend', trendYear],
    queryFn: () => apiClient.get<RevenueTrendResponse>(`/portal/revenue-trend?year=${trendYear}`),
  });

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ['portal', 'pipeline', periodKey],
    queryFn: () => apiClient.get<PipelineResponse>(`/portal/pipeline?_=1${periodParams}`),
  });

  return (
    <div className="space-y-6">
      <AnnouncementBanner />

      <DashboardMonthFilter
        value={periodFilter}
        onChange={setPeriodFilter}
      />

      <KpiSummaryCards
        data={summary}
        isLoading={summaryLoading}
        kpiUnit={summary?.kpiSummaries?.[0]?.unit}
        hideAchievementRate
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueTrendChart
            data={trend}
            year={trendYear}
            onYearChange={setTrendYear}
            isLoading={trendLoading}
          />
        </div>
        <div>
          <PortalBusinessCards
            data={summary?.portalBusinesses}
            isLoading={summaryLoading}
          />
        </div>
      </div>

      <PipelineChart data={pipeline} isLoading={pipelineLoading} />
    </div>
  );
}

// ============================================
// 事業別ビュー
// ============================================

function PortalBusinessDashboard({ businessId }: { businessId: number }) {
  const { user } = useAuth();
  const isPartnerAdmin = user?.role === 'partner_admin';

  const [trendYear, setTrendYear] = useState(getCurrentFiscalYear);
  const [selectedKpiKey, setSelectedKpiKey] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(getDefaultPeriodFilter);
  const [rankingMode, setRankingMode] = useState<'staff' | 'subordinate'>('staff');

  const kpiParam = selectedKpiKey ? `&kpiKey=${selectedKpiKey}` : '';
  const periodParams = buildPeriodParams(periodFilter);
  const periodKey = periodQueryKey(periodFilter);

  // サマリー（KPI定義もここから取得）
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['portal', 'summary', businessId, selectedKpiKey, periodKey],
    queryFn: () =>
      apiClient.get<PortalDashboardSummary>(
        `/portal/summary?businessId=${businessId}${kpiParam}${periodParams}`,
      ),
  });

  const kpiDefinitions = useMemo<KpiDefinition[]>(
    () => summary?.kpiDefinitions ?? [],
    [summary],
  );

  // KPI定義が変わったらデフォルト選択
  useEffect(() => {
    if (kpiDefinitions.length > 0 && !selectedKpiKey) {
      const primary = kpiDefinitions.find((k) => k.isPrimary);
      setSelectedKpiKey(primary?.key ?? kpiDefinitions[0].key);
    }
  }, [kpiDefinitions, selectedKpiKey]);

  // 売上推移
  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['portal', 'revenue-trend', businessId, trendYear, selectedKpiKey],
    queryFn: () =>
      apiClient.get<RevenueTrendResponse>(
        `/portal/revenue-trend?businessId=${businessId}&year=${trendYear}${kpiParam}`,
      ),
    enabled: !!selectedKpiKey || kpiDefinitions.length === 0,
  });

  // パイプライン
  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ['portal', 'pipeline', businessId, selectedKpiKey, periodKey],
    queryFn: () =>
      apiClient.get<PipelineResponse>(
        `/portal/pipeline?businessId=${businessId}${kpiParam}${periodParams}`,
      ),
    enabled: !!selectedKpiKey || kpiDefinitions.length === 0,
  });

  // ランキング（partner_admin のみ）
  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['portal', 'partner-ranking', businessId, selectedKpiKey, periodKey, rankingMode],
    queryFn: () =>
      apiClient.get<PartnerRankingResponse>(
        `/portal/partner-ranking?businessId=${businessId}&mode=${rankingMode}${kpiParam}${periodParams}`,
      ),
    enabled: isPartnerAdmin,
  });

  const currentKpi = kpiDefinitions.find((k) => k.key === selectedKpiKey);

  return (
    <div className="space-y-6">
      <AnnouncementBanner businessId={businessId} />

      <DashboardMonthFilter
        value={periodFilter}
        onChange={setPeriodFilter}
      />

      {kpiDefinitions.length > 1 && (
        <KpiTabSelector
          kpiDefinitions={kpiDefinitions}
          selectedKey={selectedKpiKey}
          onSelect={setSelectedKpiKey}
        />
      )}

      <KpiSummaryCards
        data={summary}
        isLoading={summaryLoading}
        kpiUnit={currentKpi?.unit}
        hideAchievementRate
      />

      <RevenueTrendChart
        data={trend}
        year={trendYear}
        onYearChange={setTrendYear}
        isLoading={trendLoading}
        kpiLabel={currentKpi?.label}
        kpiUnit={currentKpi?.unit}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PipelineChart data={pipeline} isLoading={pipelineLoading} />
        {isPartnerAdmin && (
          <PortalPartnerRanking
            data={ranking}
            isLoading={rankingLoading}
            mode={rankingMode}
            onModeChange={setRankingMode}
            hasSubordinates
          />
        )}
      </div>

      {/* 資料共有 & 支払明細書 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BusinessDocumentSection
          businessId={businessId}
          documentType="material"
          title="資料共有"
          apiBase="/portal"
        />
        <BusinessDocumentSection
          businessId={businessId}
          documentType="invoice"
          title="支払明細書"
          apiBase="/portal"
        />
      </div>
    </div>
  );
}

// ============================================
// メインコンポーネント
// ============================================

export default function PortalClient() {
  const { user } = useAuth();
  const { selectedBusinessId, currentBusiness, hasHydrated } = useBusiness();

  if (!hasHydrated) return null;

  const title = selectedBusinessId && currentBusiness
    ? `ダッシュボード — ${currentBusiness.businessName}`
    : 'ダッシュボード';

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        breadcrumbs={[{ label: `ようこそ、${user?.name ?? 'ゲスト'} さん` }]}
      />

      {selectedBusinessId ? (
        <PortalBusinessDashboard businessId={selectedBusinessId} />
      ) : (
        <PortalCompanyDashboard />
      )}
    </div>
  );
}
