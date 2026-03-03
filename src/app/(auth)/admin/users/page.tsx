'use client';

import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserListClient } from './_client';

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UserListClient />
    </Suspense>
  );
}
