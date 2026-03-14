import type { Metadata } from 'next';
import { ProjectListClient } from './_client';

export const metadata: Metadata = {
  title: '契約マスタ',
};

export default function ProjectsPage() {
  return <ProjectListClient />;
}
