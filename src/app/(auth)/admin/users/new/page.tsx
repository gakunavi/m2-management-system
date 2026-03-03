import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserFormClient } from '../_form-client';

export default function NewUserPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UserFormClient mode="new" />
    </Suspense>
  );
}
