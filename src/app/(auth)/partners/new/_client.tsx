'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { partnerFormConfig } from '@/config/entities/partner';

export function PartnerNewClient() {
  return (
    <EntityFormTemplate
      config={partnerFormConfig}
      breadcrumbs={[
        { label: '代理店マスタ一覧', href: '/partners' },
        { label: '新規登録' },
      ]}
    />
  );
}
