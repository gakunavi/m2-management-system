'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { businessFormConfig } from '@/config/entities/business';

interface Props {
  id: string;
}

export function BusinessEditClient({ id }: Props) {
  return (
    <EntityFormTemplate
      config={businessFormConfig}
      id={id}
      breadcrumbs={[
        { label: '事業マスタ一覧', href: '/businesses' },
        { label: '事業詳細', href: `/businesses/${id}` },
        { label: '編集' },
      ]}
    />
  );
}
