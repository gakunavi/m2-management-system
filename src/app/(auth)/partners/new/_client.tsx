'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { usePartnerConfig } from '@/hooks/use-partner-config';
import { useBusiness } from '@/hooks/use-business';

export function PartnerNewClient() {
  const { selectedBusinessId } = useBusiness();
  const { formConfig } = usePartnerConfig(selectedBusinessId);

  return (
    <EntityFormTemplate
      config={formConfig}
      breadcrumbs={[
        { label: '代理店マスタ一覧', href: '/partners' },
        { label: '新規登録' },
      ]}
    />
  );
}
