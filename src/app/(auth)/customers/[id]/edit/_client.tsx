'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { customerFormConfig } from '@/config/entities/customer';

interface Props {
  id: string;
}

export function CustomerEditClient({ id }: Props) {
  return (
    <EntityFormTemplate
      config={customerFormConfig}
      id={id}
      breadcrumbs={[
        { label: '顧客マスタ一覧', href: '/customers' },
        { label: '顧客詳細', href: `/customers/${id}` },
        { label: '編集' },
      ]}
    />
  );
}
