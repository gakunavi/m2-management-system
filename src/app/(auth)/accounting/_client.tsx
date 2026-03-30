'use client';

import { useMemo, Suspense } from 'react';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { useBusiness } from '@/hooks/use-business';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { accountingPipelineListConfig } from '@/config/entities/accounting-pipeline';

export function AccountingPipelineListClient() {
  const { selectedBusinessId, hasHydrated } = useBusiness();

  const config = useMemo(() => {
    if (!selectedBusinessId) return accountingPipelineListConfig;
    return {
      ...accountingPipelineListConfig,
      apiEndpoint: `${accountingPipelineListConfig.apiEndpoint}?businessId=${selectedBusinessId}`,
    };
  }, [selectedBusinessId]);

  if (!hasHydrated) return <LoadingSpinner />;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EntityListTemplate config={config} />
    </Suspense>
  );
}
