'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { InfoTabContent } from '@/components/templates/entity-detail-template';
import { useCustomerConfig } from '@/hooks/use-customer-config';
import type { InfoTabConfig } from '@/types/config';

interface Props {
  entityId: number;
}

export function ProjectCustomerInfoTab({ entityId }: Props) {
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

  const customerId = project?.customerId as number | undefined;
  const businessId = project?.businessId as number | undefined;

  // 動的config（カスタムフィールドセクション含む）
  const { detailConfig } = useCustomerConfig(businessId ?? null);

  // 顧客詳細データ（businessId付きで事業別カスタムデータも取得）
  const { data: customer, isLoading, error } = useQuery<Record<string, unknown>>({
    queryKey: ['customer', String(customerId), businessId],
    queryFn: () => {
      const qs = businessId ? `?businessId=${businessId}` : '';
      return apiClient.get<Record<string, unknown>>(`/customers/${customerId}${qs}`);
    },
    enabled: !!customerId,
  });

  if (!project || isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message="顧客情報の取得に失敗しました" />;
  if (!customer) return <LoadingSpinner />;

  const infoConfig = detailConfig.tabs[0].config as InfoTabConfig;
  const customerName = customer.customerName as string;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/customers/${customerId}?from=/projects/${entityId},案件詳細`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {customerName} の詳細ページへ
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <InfoTabContent config={infoConfig} data={customer} />
    </div>
  );
}
