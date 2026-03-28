'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { useCustomerConfig } from '@/hooks/use-customer-config';
import { useBusiness } from '@/hooks/use-business';

export function CustomerNewClient() {
  const { selectedBusinessId } = useBusiness();
  const { formConfig } = useCustomerConfig(selectedBusinessId);

  return (
    <EntityFormTemplate
      config={formConfig}
      breadcrumbs={[
        { label: '顧客マスタ一覧', href: '/customers' },
        { label: '新規登録' },
      ]}
    />
  );
}
