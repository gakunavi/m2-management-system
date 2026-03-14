import type { Metadata } from 'next';
import { PartnersClient } from './_client';

export const metadata: Metadata = { title: '代理店マスタ' };

export default function PartnersPage() {
  return <PartnersClient />;
}
