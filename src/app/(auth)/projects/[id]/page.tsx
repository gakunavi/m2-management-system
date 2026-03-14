import type { Metadata } from 'next';
import { ProjectDetailClient } from './_client';

export const metadata: Metadata = {
  title: '契約マスタ - 詳細',
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetailClient id={id} />;
}
