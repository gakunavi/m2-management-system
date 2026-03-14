import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaffFormClient } from '../_form-client';

export const metadata: Metadata = {
  title: 'スタッフ - 新規登録',
};

export default function NewStaffPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <StaffFormClient mode="new" />
    </Suspense>
  );
}
