import { InquiryDetailClient } from './_client';

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InquiryDetailClient id={id} />;
}
