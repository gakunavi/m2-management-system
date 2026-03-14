import type { Metadata } from 'next';
import { PartnerNewClient } from './_client';

export const metadata: Metadata = { title: '代理店マスタ - 新規登録' };

export default function PartnerNewPage() {
  return <PartnerNewClient />;
}
