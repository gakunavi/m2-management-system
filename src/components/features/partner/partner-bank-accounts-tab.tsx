'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BankAccountsTab } from '@/components/shared/bank-accounts-tab';
import { TabCsvImport } from '@/components/shared/tab-csv-import';
import { PARTNER_BANK_ACCOUNT_TEMPLATE_COLUMNS } from '@/lib/csv-helpers';

interface Props {
  entityId: number;
}

export function PartnerBankAccountsTab({ entityId }: Props) {
  const queryClient = useQueryClient();

  return (
    <BankAccountsTab
      entityId={entityId}
      apiEndpoint={`/partners/${entityId}/bank-accounts`}
      queryKey="partner-bank-accounts"
      headerActions={
        <TabCsvImport
          endpoint="/partners/csv/bank-accounts"
          templateColumns={PARTNER_BANK_ACCOUNT_TEMPLATE_COLUMNS}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['partner-bank-accounts', entityId] });
          }}
        />
      }
    />
  );
}
