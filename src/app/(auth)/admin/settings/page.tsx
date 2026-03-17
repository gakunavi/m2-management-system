import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SystemSettingsClient } from './_client';

export const metadata: Metadata = {
  title: 'システム設定',
};

export default function SystemSettingsPage() {
  return (
    <Suspense fallback={<div className="p-6">読み込み中...</div>}>
      <SystemSettingsClient />
    </Suspense>
  );
}
