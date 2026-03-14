import type { Metadata } from 'next';
import { AnnouncementFormClient } from '../_form-client';

export const metadata: Metadata = {
  title: 'お知らせ - 詳細',
};

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AnnouncementFormClient id={id} />;
}
