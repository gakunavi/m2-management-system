'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EntityFormTemplate } from '@/components/templates/entity-form-template';
import { useProjectConfig } from '@/hooks/use-project-config';
import { useBusiness } from '@/hooks/use-business';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface Props {
  mode: 'create' | 'edit';
  id?: string;
}

export function ProjectFormClient({ mode, id }: Props) {
  const router = useRouter();
  const { selectedBusinessId, hasHydrated } = useBusiness();
  const { formConfig, isLoading } = useProjectConfig(selectedBusinessId);

  // 事業未選択時はダッシュボードへリダイレクト（hydration完了後に判定）
  useEffect(() => {
    if (hasHydrated && !selectedBusinessId) {
      router.replace('/dashboard');
    }
  }, [hasHydrated, selectedBusinessId, router]);

  if (!hasHydrated || !selectedBusinessId || isLoading) return <LoadingSpinner />;

  return (
    <EntityFormTemplate
      config={formConfig}
      id={id}
      breadcrumbs={[
        { label: '案件一覧', href: '/projects' },
        ...(mode === 'edit' && id ? [{ label: '案件詳細', href: `/projects/${id}` }] : []),
        { label: mode === 'create' ? '新規登録' : '編集' },
      ]}
    />
  );
}
