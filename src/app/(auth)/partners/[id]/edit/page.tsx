import type { Metadata } from 'next';
import { PartnerEditClient } from './_client';

export const metadata: Metadata = {
  title: '代理店マスタ - 編集',
};

export default async function PartnerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartnerEditClient id={id} />;
}
