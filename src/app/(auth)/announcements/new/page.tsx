import type { Metadata } from 'next';
import { AnnouncementFormClient } from '../_form-client';

export const metadata: Metadata = {
  title: 'お知らせ - 新規作成',
};

export default function NewAnnouncementPage() {
  return <AnnouncementFormClient />;
}
