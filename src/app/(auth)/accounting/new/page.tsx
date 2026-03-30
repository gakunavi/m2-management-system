import type { Metadata } from 'next';
import { AccountingPipelineNewClient } from './_client';

export const metadata: Metadata = {
  title: '会計パイプライン新規作成',
};

export default function AccountingPipelineNewPage() {
  return <AccountingPipelineNewClient />;
}
