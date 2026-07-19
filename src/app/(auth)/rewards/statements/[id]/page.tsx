import type { Metadata } from 'next';
import { RewardStatementDetailClient } from './_client';

export const metadata: Metadata = {
  title: '報酬明細書',
};

export default async function RewardStatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RewardStatementDetailClient id={id} />;
}
