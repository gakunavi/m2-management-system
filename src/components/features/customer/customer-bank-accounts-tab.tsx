'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BankAccountsTab } from '@/components/shared/bank-accounts-tab';
import { TabCsvImport } from '@/components/shared/tab-csv-import';
import { CUSTOMER_BANK_ACCOUNT_TEMPLATE_COLUMNS } from '@/lib/csv-helpers';

interface Props {
  entityId: number;
}

export function CustomerBankAccountsTab({ entityId }: Props) {
  const queryClient = useQueryClient();

  return (
    <BankAccountsTab
      entityId={entityId}
      apiEndpoint={`/customers/${entityId}/bank-accounts`}
      queryKey="customer-bank-accounts"
      headerActions={
        <TabCsvImport
          endpoint="/customers/csv/bank-accounts"
          templateColumns={CUSTOMER_BANK_ACCOUNT_TEMPLATE_COLUMNS}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['customer-bank-accounts', entityId] });
          }}
        />
      }
    />
  );
}
