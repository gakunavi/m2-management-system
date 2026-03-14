import type { Metadata } from 'next';
import { PortalMovementsClient } from './_client';

export const metadata: Metadata = {
  title: '案件ムーブメント',
};

export default function PortalMovementsPage() {
  return <PortalMovementsClient />;
}
