'use client';

import { EntityDetailTemplate } from '@/components/templates/entity-detail-template';
import { businessDetailConfig } from '@/config/entities/business';
import { StatusDefinitionsTab } from '@/components/features/business/status-definitions-tab';
import { MovementTemplatesTab } from '@/components/features/business/movement-templates-tab';
import { ProjectFieldsTab } from '@/components/features/business/project-fields-tab';
import { RevenueRecognitionSettings } from '@/components/features/business/revenue-recognition-settings';
import { FileCategoriesTab } from '@/components/features/business/file-categories-tab';
import { SalesTargetsTab } from '@/components/features/business/sales-targets-tab';

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
