'use client';

import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaffListClient } from './_client';

export default function PartnerStaffPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <StaffListClient />
    </Suspense>
  );
}
