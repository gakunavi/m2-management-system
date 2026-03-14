import type { Metadata } from 'next';
import { PartnerDetailClient } from './_client';

export const metadata: Metadata = {
  title: '代理店マスタ - 詳細',
};

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartnerDetailClient id={id} />;
}
