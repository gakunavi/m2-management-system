import { BusinessEditClient } from './_client';

export default async function BusinessEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BusinessEditClient id={id} />;
}
