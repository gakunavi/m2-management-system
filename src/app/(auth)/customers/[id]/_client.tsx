'use client';

import { EntityDetailTemplate } from '@/components/templates/entity-detail-template';
import { customerDetailConfig } from '@/config/entities/customer';
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

  return (
    <EntityDetailTemplate
      config={customerDetailConfig}
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
