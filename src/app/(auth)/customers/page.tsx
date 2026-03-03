'use client';

import { Suspense } from 'react';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { customerListConfig } from '@/config/entities/customer';
import { useBusinessColumns } from '@/hooks/use-business-columns';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

function CustomersPageContent() {
  const { config } = useBusinessColumns(customerListConfig, 'customer');

  return <EntityListTemplate config={config} />;
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CustomersPageContent />
    </Suspense>
  );
}
