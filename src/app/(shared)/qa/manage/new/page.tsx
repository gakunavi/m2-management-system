import type { Metadata } from 'next';
import { QaNewClient } from './_client';

export const metadata: Metadata = {
  title: 'QA - 新規作成',
};

export default function QaNewPage() {
  return <QaNewClient />;
}
