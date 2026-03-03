'use client';

import { EntityDetailTemplate } from '@/components/templates/entity-detail-template';
import { partnerDetailConfig } from '@/config/entities/partner';
import { useBreadcrumbFrom } from '@/hooks/use-breadcrumb-from';
import { PartnerContactsTab } from '@/components/features/partner/partner-contacts-tab';
import { PartnerBankAccountsTab } from '@/components/features/partner/partner-bank-accounts-tab';
import { PartnerGroupTab } from '@/components/features/partner/partner-group-tab';
import { PartnerProjectsTab } from '@/components/features/partner/partner-projects-tab';
import { PartnerInvoicesTab } from '@/components/features/partner/partner-invoices-tab';
import { PartnerBusinessLinksTab } from '@/components/features/partner/partner-business-links-tab';

interface Props {
  id: string;
}

const CUSTOM_TABS = {
  contacts: PartnerContactsTab,
  bankAccounts: PartnerBankAccountsTab,
  partnerGroup: PartnerGroupTab,
  projects: PartnerProjectsTab,
  businesses: PartnerBusinessLinksTab,
  invoices: PartnerInvoicesTab,
};

export function PartnerDetailClient({ id }: Props) {
  const fromCrumb = useBreadcrumbFrom();

  return (
    <EntityDetailTemplate
      config={partnerDetailConfig}
      id={id}
      breadcrumbs={[
        ...(fromCrumb
          ? [fromCrumb]
          : [{ label: '代理店マスタ一覧', href: '/partners' }]),
        { label: '代理店詳細' },
      ]}
      customTabs={CUSTOM_TABS}
    />
  );
}
