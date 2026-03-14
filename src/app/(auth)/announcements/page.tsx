import type { Metadata } from 'next';
import { AnnouncementListClient } from './_client';

export const metadata: Metadata = {
  title: 'お知らせ',
};

export default function AnnouncementsPage() {
  return <AnnouncementListClient />;
}
