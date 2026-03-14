import type { Metadata } from 'next';
import DashboardClient from './_client';

export const metadata: Metadata = {
  title: 'ダッシュボード',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
