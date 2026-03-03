'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { businessFormConfig } from '@/config/entities/business';

export default function BusinessNewPage() {
  return (
    <EntityFormTemplate
      config={businessFormConfig}
      breadcrumbs={[
        { label: '事業マスタ一覧', href: '/businesses' },
        { label: '新規登録' },
      ]}
    />
  );
}
