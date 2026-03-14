import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserFormClient } from '../_form-client';

export const metadata: Metadata = {
  title: 'ユーザー管理 - 詳細',
};

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UserFormClient mode="edit" userId={id} />
    </Suspense>
  );
}
