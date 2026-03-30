import type { Metadata } from 'next';
import { AccountingPipelineDetailClient } from './_client';

export const metadata: Metadata = {
  title: '会計パイプライン詳細',
};

export default async function AccountingPipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AccountingPipelineDetailClient id={parseInt(id, 10)} />;
}
