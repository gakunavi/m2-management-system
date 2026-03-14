import type { Metadata } from 'next';
import { BusinessNewClient } from './_client';

export const metadata: Metadata = { title: '事業マスタ - 新規登録' };

export default function BusinessNewPage() {
  return <BusinessNewClient />;
}
