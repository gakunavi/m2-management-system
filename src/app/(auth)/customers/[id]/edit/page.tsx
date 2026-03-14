import type { Metadata } from 'next';
import { CustomerEditClient } from './_client';

export const metadata: Metadata = {
  title: '顧客マスタ - 編集',
};

export default async function CustomerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerEditClient id={id} />;
}
