import type { Metadata } from 'next';
import { BusinessesClient } from './_client';

export const metadata: Metadata = { title: '事業マスタ' };

export default function BusinessesPage() {
  return <BusinessesClient />;
}
