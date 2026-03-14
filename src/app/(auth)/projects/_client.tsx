'use client';

import { useMemo, Suspense, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { ProjectFilterPanel } from '@/components/features/project/project-filter-panel';
import { useProjectConfig } from '@/hooks/use-project-config';
import { useBusiness } from '@/hooks/use-business';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export function ProjectListClient() {
  const router = useRouter();
  const { selectedBusinessId, hasHydrated } = useBusiness();
  const { listConfig, statusDefinitions, isLoading } = useProjectConfig(selectedBusinessId);

  // 事業未選択時はダッシュボードへリダイレクト（hydration完了後に判定）
  useEffect(() => {
    if (hasHydrated && !selectedBusinessId) {
      router.replace('/dashboard');
    }
  }, [hasHydrated, selectedBusinessId, router]);

  // renderBeforeTable で SalesStatusFilter + ExpectedCloseMonthFilter を描画
  const renderBeforeTable = useCallback(
    ({ filters, setFilter }: { filters: Record<string, string>; setFilter: (key: string, value: string) => void }) => {
      const selectedStatuses = filters.projectSalesStatus
        ? filters.projectSalesStatus.split(',').filter(Boolean)
        : [];
      const monthFrom = filters.expectedCloseMonthFrom || null;
      const monthTo = filters.expectedCloseMonthTo || null;
      return (
        <ProjectFilterPanel
          statusDefinitions={statusDefinitions}
          selectedStatuses={selectedStatuses}
          onStatusChange={(statuses) => {
            setFilter('projectSalesStatus', statuses.join(','));
          }}
          monthFrom={monthFrom}
          monthTo={monthTo}
          onMonthChange={(from, to) => {
            setFilter('expectedCloseMonthFrom', from ?? '');
            setFilter('expectedCloseMonthTo', to ?? '');
          }}
        />
      );
    },
    [statusDefinitions],
  );

  // businessId を apiEndpoint のクエリパラメータとして注入
  const configWithBusinessId = useMemo(() => {
    if (!selectedBusinessId) return listConfig;
    return {
      ...listConfig,
      apiEndpoint: `${listConfig.apiEndpoint}?businessId=${selectedBusinessId}`,
      renderBeforeTable,
    };
  }, [listConfig, selectedBusinessId, renderBeforeTable]);

  if (!hasHydrated || !selectedBusinessId || isLoading) return <LoadingSpinner />;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EntityListTemplate config={configWithBusinessId} />
    </Suspense>
  );
}
