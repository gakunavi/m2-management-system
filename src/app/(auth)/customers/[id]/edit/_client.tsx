'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { useCustomerConfig } from '@/hooks/use-customer-config';
import { useBusiness } from '@/hooks/use-business';

interface Props {
  id: string;
}

export function CustomerEditClient({ id }: Props) {
  const { selectedBusinessId } = useBusiness();
  const { formConfig } = useCustomerConfig(selectedBusinessId);

  return (
    <EntityFormTemplate
      config={formConfig}
      id={id}
      breadcrumbs={[
        { label: '顧客マスタ一覧', href: '/customers' },
        { label: '顧客詳細', href: `/customers/${id}` },
        { label: '編集' },
      ]}
    />
  );
}
