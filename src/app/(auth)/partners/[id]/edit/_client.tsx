'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { partnerFormConfig } from '@/config/entities/partner';

interface Props {
  id: string;
}

export function PartnerEditClient({ id }: Props) {
  return (
    <EntityFormTemplate
      config={partnerFormConfig}
      id={id}
      breadcrumbs={[
        { label: '代理店マスタ一覧', href: '/partners' },
        { label: '代理店詳細', href: `/partners/${id}` },
        { label: '編集' },
      ]}
    />
  );
}
