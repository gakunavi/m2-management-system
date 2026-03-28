'use client';

import { EntityDetailTemplate } from '@/components/templates/entity-detail-template';
import { useCustomerConfig } from '@/hooks/use-customer-config';
import { useBusiness } from '@/hooks/use-business';
import { useBreadcrumbFrom } from '@/hooks/use-breadcrumb-from';
import { CustomerContactsTab } from '@/components/features/customer/customer-contacts-tab';
import { CustomerBankAccountsTab } from '@/components/features/customer/customer-bank-accounts-tab';
import { CustomerBusinessLinksTab } from '@/components/features/customer/customer-business-links-tab';
import { CustomerProjectsTab } from '@/components/features/customer/customer-projects-tab';

interface Props {
  id: string;
}

const CUSTOM_TABS = {
  contacts: CustomerContactsTab,
  bankAccounts: CustomerBankAccountsTab,
  businesses: CustomerBusinessLinksTab,
  projects: CustomerProjectsTab,
};

export function CustomerDetailClient({ id }: Props) {
  const fromCrumb = useBreadcrumbFrom();
  const { selectedBusinessId } = useBusiness();
  const { detailConfig } = useCustomerConfig(selectedBusinessId);

  return (
    <EntityDetailTemplate
      config={detailConfig}
      id={id}
      breadcrumbs={[
        ...(fromCrumb
          ? [fromCrumb]
          : [{ label: '顧客マスタ一覧', href: '/customers' }]),
        { label: '顧客詳細' },
      ]}
      customTabs={CUSTOM_TABS}
    />
  );
}
