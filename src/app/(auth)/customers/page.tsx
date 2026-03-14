import type { Metadata } from 'next';
import { CustomersClient } from './_client';

export const metadata: Metadata = { title: '顧客マスタ' };

export default function CustomersPage() {
  return <CustomersClient />;
}
