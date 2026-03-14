import type { Metadata } from 'next';
import { BusinessEditClient } from './_client';

export const metadata: Metadata = {
  title: '事業マスタ - 編集',
};

export default async function BusinessEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BusinessEditClient id={id} />;
}
