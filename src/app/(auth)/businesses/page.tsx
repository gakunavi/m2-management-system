'use client';

import { Suspense } from 'react';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { businessListConfig } from '@/config/entities/business';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function BusinessesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EntityListTemplate config={businessListConfig} />
    </Suspense>
  );
}
