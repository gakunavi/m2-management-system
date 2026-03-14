import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserFormClient } from '../_form-client';

export const metadata: Metadata = {
  title: 'ユーザー管理 - 新規登録',
};

export default function NewUserPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UserFormClient mode="new" />
    </Suspense>
  );
}
