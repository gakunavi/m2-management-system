import type { Metadata } from 'next';
import { BusinessDetailClient } from './_client';

export const metadata: Metadata = {
  title: '事業マスタ - 詳細',
};

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BusinessDetailClient id={id} />;
}
