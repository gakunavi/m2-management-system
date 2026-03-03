'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { customerFormConfig } from '@/config/entities/customer';

export default function CustomerNewPage() {
  return (
    <EntityFormTemplate
      config={customerFormConfig}
      breadcrumbs={[
        { label: '顧客マスタ一覧', href: '/customers' },
        { label: '新規登録' },
      ]}
    />
  );
}
