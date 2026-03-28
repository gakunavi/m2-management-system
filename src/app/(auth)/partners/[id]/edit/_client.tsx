'use client';

import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { usePartnerConfig } from '@/hooks/use-partner-config';
import { useBusiness } from '@/hooks/use-business';

interface Props {
  id: string;
}

export function PartnerEditClient({ id }: Props) {
  const { selectedBusinessId } = useBusiness();
  const { formConfig } = usePartnerConfig(selectedBusinessId);

  return (
    <EntityFormTemplate
      config={formConfig}
      id={id}
      breadcrumbs={[
        { label: '代理店マスタ一覧', href: '/partners' },
        { label: '代理店詳細', href: `/partners/${id}` },
        { label: '編集' },
      ]}
    />
  );
}
