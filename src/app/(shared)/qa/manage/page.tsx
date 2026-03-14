import type { Metadata } from 'next';
import { QaManageClient } from './_client';

export const metadata: Metadata = {
  title: 'QA管理',
};

export default function QaManagePage() {
  return <QaManageClient />;
}
