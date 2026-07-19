import type { Metadata } from 'next';
import { PortalRewardsClient } from './_client';

export const metadata: Metadata = {
  title: '報酬',
};

export default function PortalRewardsPage() {
  return <PortalRewardsClient />;
}
