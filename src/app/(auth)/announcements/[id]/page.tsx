import { AnnouncementFormClient } from '../_form-client';

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AnnouncementFormClient id={id} />;
}
