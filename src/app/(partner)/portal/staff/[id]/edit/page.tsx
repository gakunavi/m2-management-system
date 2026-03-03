import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StaffFormClient } from '../../_form-client';

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <StaffFormClient mode="edit" staffId={id} />
    </Suspense>
  );
}
