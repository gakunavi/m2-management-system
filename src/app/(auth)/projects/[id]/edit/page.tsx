import { ProjectFormClient } from '../../_form-client';

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectFormClient mode="edit" id={id} />;
}
