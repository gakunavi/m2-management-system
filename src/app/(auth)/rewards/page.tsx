import type { Metadata } from 'next';
import { RewardsClient } from './_client';

export const metadata: Metadata = {
  title: '報酬管理',
};

export default function RewardsPage() {
  return <RewardsClient />;
}
