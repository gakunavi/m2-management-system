import type { Metadata } from 'next';
import { MovementsClient } from './_client';

export const metadata: Metadata = {
  title: '案件ムーブメント',
};

export default function MovementsPage() {
  return <MovementsClient />;
}
