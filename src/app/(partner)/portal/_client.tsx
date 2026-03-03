'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { PageHeader } from '@/components/layout/page-header';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { PortalSummaryCards } from '@/components/features/portal/portal-summary-cards';

const PortalPipeline = dynamic(
  () => import('@/components/features/portal/portal-pipeline').then((m) => m.PortalPipeline),
  { loading: () => <Skeleton className="h-64 w-full rounded-lg" /> },
);
import { BusinessDocumentSection } from '@/components/features/dashboard/business-document-section';
import { AnnouncementBanner } from '@/components/features/announcement/announcement-banner';
import type { PortalSummaryResponse } from '@/types/dashboard';

interface PipelineResponse {
  statuses: {
    statusCode: string;
    statusLabel: string;
    statusColor: string;
    projectCount: number;
    totalAmount: number;
  }[];
}

export default function PortalClient() {
  const { user } = useAuth();
  const { selectedBusinessId, switchBusiness } = useBusiness();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['portal', 'summary'],
    queryFn: () => apiClient.get<PortalSummaryResponse>('/portal/summary'),
  });

  const pipelineParams = selectedBusinessId ? `?businessId=${selectedBusinessId}` : '';
  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ['portal', 'pipeline', selectedBusinessId],
    queryFn: () => apiClient.get<PipelineResponse>(`/portal/pipeline${pipelineParams}`),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="ダッシュボード"
        breadcrumbs={[{ label: `ようこそ、${user?.name ?? 'ゲスト'} さん` }]}
      />

      <AnnouncementBanner businessId={selectedBusinessId} />

      <PortalSummaryCards
        businesses={summary?.businesses}
        totals={summary?.totals}
        selectedBusinessId={selectedBusinessId}
        onBusinessClick={switchBusiness}
        isLoading={summaryLoading}
      />

      <PortalPipeline data={pipeline} isLoading={pipelineLoading} />

      {/* 資料共有 & 支払明細書（事業選択時のみ） */}
      {selectedBusinessId && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <BusinessDocumentSection
            businessId={selectedBusinessId}
            documentType="material"
            title="資料共有"
            apiBase="/portal"
          />
          <BusinessDocumentSection
            businessId={selectedBusinessId}
            documentType="invoice"
            title="支払明細書"
            apiBase="/portal"
          />
        </div>
      )}
    </div>
  );
}
