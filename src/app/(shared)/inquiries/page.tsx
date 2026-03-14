import type { Metadata } from 'next';
import { InquiriesClient } from './_client';

export const metadata: Metadata = {
  title: '問い合わせ',
};

export default function InquiriesPage() {
  return <InquiriesClient />;
}
