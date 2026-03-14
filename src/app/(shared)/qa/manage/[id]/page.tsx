import type { Metadata } from 'next';
import { QaDetailClient } from './_client';

export const metadata: Metadata = {
  title: 'QA - 詳細',
};

export default async function QaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QaDetailClient id={id} />;
}
