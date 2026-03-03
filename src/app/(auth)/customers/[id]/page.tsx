import { CustomerDetailClient } from './_client';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailClient id={id} />;
}
