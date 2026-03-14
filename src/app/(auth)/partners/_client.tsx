'use client';

import { Suspense } from 'react';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { partnerListConfig } from '@/config/entities/partner';
import { useBusinessColumns } from '@/hooks/use-business-columns';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

function PartnersPageContent() {
  const { config } = useBusinessColumns(partnerListConfig, 'partner');

  return <EntityListTemplate config={config} />;
}

export function PartnersClient() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PartnersPageContent />
    </Suspense>
  );
}
