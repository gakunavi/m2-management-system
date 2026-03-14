import type { Metadata } from 'next';
import { QaKnowledgeBaseClient } from './_client';

export const metadata: Metadata = {
  title: 'QA・FAQ',
};

export default function QaPage() {
  return <QaKnowledgeBaseClient />;
}
