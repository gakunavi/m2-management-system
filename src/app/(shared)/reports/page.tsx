import type { Metadata } from 'next';
import { ReportsClient } from './_client';

export const metadata: Metadata = {
  title: 'レポート',
};

export default function ReportsPage() {
  return <ReportsClient />;
}
