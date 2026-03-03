import { BusinessDetailClient } from './_client';

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BusinessDetailClient id={id} />;
}
