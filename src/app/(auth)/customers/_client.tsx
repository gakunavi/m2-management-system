'use client';

import { Suspense } from 'react';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { useBusinessColumns } from '@/hooks/use-business-columns';
import { useCustomerConfig } from '@/hooks/use-customer-config';
import { useBusiness } from '@/hooks/use-business';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

function CustomersPageContent() {
  const { selectedBusinessId } = useBusiness();
  const { listConfig } = useCustomerConfig(selectedBusinessId);
  const { config } = useBusinessColumns(listConfig, 'customer');

  return <EntityListTemplate config={config} />;
}

export function CustomersClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CustomersPageContent />
    </Suspense>
  );
}
