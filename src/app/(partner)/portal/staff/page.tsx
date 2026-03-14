import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaffListClient } from './_client';

export const metadata: Metadata = { title: 'スタッフ管理' };

export default function PartnerStaffPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <StaffListClient />
    </Suspense>
  );
}
