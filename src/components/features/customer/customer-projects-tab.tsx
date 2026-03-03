'use client';

import { RelatedProjectsTab } from '@/components/shared/related-projects-tab';

interface Props {
  entityId: number;
}

export function CustomerProjectsTab({ entityId }: Props) {
  return <RelatedProjectsTab entityId={entityId} filterBy="customer" />;
}
