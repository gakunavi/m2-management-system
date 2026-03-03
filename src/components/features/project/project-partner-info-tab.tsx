'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { EmptyState } from '@/components/ui/empty-state';
import { InfoTabContent } from '@/components/templates/entity-detail-template';
import { partnerDetailConfig } from '@/config/entities/partner';
import type { InfoTabConfig } from '@/types/config';

interface Props {
  entityId: number;
}

export function ProjectPartnerInfoTab({ entityId }: Props) {
  // プロジェクトデータ（キャッシュヒット）
  const { data: project } = useQuery<Record<string, unknown>>({
    queryKey: ['project', String(entityId)],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects/${entityId}`);
      if (!res.ok) throw new Error('取得失敗');
      const json = await res.json() as { data: Record<string, unknown> };
      return json.data;
    },
  });

  const partnerId = project?.partnerId as number | null | undefined;

  // 代理店詳細データ
  const { data: partner, isLoading, error } = useQuery<Record<string, unknown>>({
    queryKey: ['partner', String(partnerId)],
    queryFn: () => apiClient.get<Record<string, unknown>>(`/partners/${partnerId}`),
    enabled: !!partnerId,
  });

  if (!project) return <LoadingSpinner />;

  // 代理店未紐付け
  if (!partnerId) {
    return <EmptyState title="紐づいている代理店はありません" />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message="代理店情報の取得に失敗しました" />;
  if (!partner) return <LoadingSpinner />;

  const infoConfig = partnerDetailConfig.tabs[0].config as InfoTabConfig;
  const partnerName = partner.partnerName as string;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/partners/${partnerId}?from=/projects/${entityId},案件詳細`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {partnerName} の詳細ページへ
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <InfoTabContent config={infoConfig} data={partner} />
    </div>
  );
}
