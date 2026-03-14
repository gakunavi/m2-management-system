import type { Metadata } from 'next';
import { CustomerNewClient } from './_client';

export const metadata: Metadata = { title: '顧客マスタ - 新規登録' };

export default function CustomerNewPage() {
  return <CustomerNewClient />;
}
