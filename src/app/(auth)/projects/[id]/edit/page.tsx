import type { Metadata } from 'next';
import { ProjectFormClient } from '../../_form-client';

export const metadata: Metadata = {
  title: '契約マスタ - 編集',
};

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectFormClient mode="edit" id={id} />;
}
