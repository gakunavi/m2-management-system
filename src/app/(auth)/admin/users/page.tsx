import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserListClient } from './_client';

export const metadata: Metadata = { title: 'ユーザー管理' };

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UserListClient />
    </Suspense>
  );
}
