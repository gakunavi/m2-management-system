import type { Metadata } from 'next';
import { InquiryDetailClient } from './_client';

export const metadata: Metadata = {
  title: '問い合わせ - 詳細',
};

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InquiryDetailClient id={id} />;
}
