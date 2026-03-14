import type { Metadata } from 'next';
import { ProjectFormClient } from '../_form-client';

export const metadata: Metadata = {
  title: '契約マスタ - 新規登録',
};

export default function ProjectNewPage() {
  return <ProjectFormClient mode="create" />;
}
