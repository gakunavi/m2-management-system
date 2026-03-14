import type { Metadata } from 'next';
import { PortalProjectsClient } from './_client';

export const metadata: Metadata = {
  title: '案件一覧',
};

export default function PortalProjectsPage() {
  return <PortalProjectsClient />;
}
