import { PartnerEditClient } from './_client';

export default async function PartnerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartnerEditClient id={id} />;
}
