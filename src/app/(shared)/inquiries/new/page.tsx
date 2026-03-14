import type { Metadata } from 'next';
import { NewInquiryClient } from './_client';

export const metadata: Metadata = {
  title: '問い合わせ - 新規作成',
};

export default function NewInquiryPage() {
  return <NewInquiryClient />;
}
