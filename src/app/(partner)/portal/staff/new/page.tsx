import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaffFormClient } from '../_form-client';

export default function NewStaffPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <StaffFormClient mode="new" />
    </Suspense>
  );
}
