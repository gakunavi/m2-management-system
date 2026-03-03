import { QaDetailClient } from './_client';

export default async function QaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QaDetailClient id={id} />;
}
