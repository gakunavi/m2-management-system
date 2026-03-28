'use client';

import { EntityDetailTemplate } from '@/components/templates/entity-detail-template';
import { businessDetailConfig } from '@/config/entities/business';
import { StatusDefinitionsTab } from '@/components/features/business/status-definitions-tab';
import { MovementTemplatesTab } from '@/components/features/business/movement-templates-tab';
import { ProjectFieldsTab } from '@/components/features/business/project-fields-tab';
import { EntityFieldsTab } from '@/components/features/business/entity-fields-tab';
import { RevenueRecognitionSettings } from '@/components/features/business/revenue-recognition-settings';
import { FileCategoriesTab } from '@/components/features/business/file-categories-tab';
import { SalesTargetsTab } from '@/components/features/business/sales-targets-tab';

function CustomerFieldsTab({ entityId }: { entityId: number }) {
  return <EntityFieldsTab entityId={entityId} entityType="customer" />;
}

function PartnerFieldsTab({ entityId }: { entityId: number }) {
  return <EntityFieldsTab entityId={entityId} entityType="partner" />;
}

interface Props {
  id: string;
}

export function BusinessDetailClient({ id }: Props) {
  return (
    <EntityDetailTemplate
      config={businessDetailConfig}
      id={id}
      customTabs={{
        statusDefinitions: StatusDefinitionsTab,
        movementTemplates: MovementTemplatesTab,
        projectFields: ProjectFieldsTab,
        customerFields: CustomerFieldsTab,
        partnerFields: PartnerFieldsTab,
        revenueRecognition: RevenueRecognitionSettings,
        fileCategories: FileCategoriesTab,
        salesTargets: SalesTargetsTab,
      }}
      breadcrumbs={[
        { label: '事業マスタ一覧', href: '/businesses' },
        { label: '事業詳細' },
      ]}
    />
  );
}
