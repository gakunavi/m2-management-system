import type { Metadata } from 'next';
import { AccountingPipelineListClient } from './_client';

export const metadata: Metadata = {
  title: '会計パイプライン',
};

export default function AccountingPipelinePage() {
  return <AccountingPipelineListClient />;
}
