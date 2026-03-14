import type { Metadata } from 'next';
import { CustomerDetailClient } from './_client';

export const metadata: Metadata = {
  title: '顧客マスタ - 詳細',
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailClient id={id} />;
}
