'use client';

import { RelatedProjectsTab } from '@/components/shared/related-projects-tab';

interface Props {
  entityId: number;
}

export function PartnerProjectsTab({ entityId }: Props) {
  return <RelatedProjectsTab entityId={entityId} filterBy="partner" />;
}
