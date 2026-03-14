import type { Metadata } from 'next';
import PortalClient from './_client';

export const metadata: Metadata = {
  title: 'ポータル',
};

export default function PortalPage() {
  return <PortalClient />;
}
