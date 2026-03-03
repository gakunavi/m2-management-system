'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { EntityDetailTemplate } from '@/components/templates/entity-detail-template';
import { useProjectConfig } from '@/hooks/use-project-config';
import { useBusiness } from '@/hooks/use-business';
import { useAuth } from '@/hooks/use-auth';
import { useBreadcrumbFrom } from '@/hooks/use-breadcrumb-from';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ProjectCustomerInfoTab } from '@/components/features/project/project-customer-info-tab';
import { ProjectPartnerInfoTab } from '@/components/features/project/project-partner-info-tab';
import { ProjectOtherProjectsTab } from '@/components/features/project/project-other-projects-tab';
import { ProjectMovementsTab } from '@/components/features/project/project-movements-tab';
import { ProjectFilesTab } from '@/components/features/project/project-files-tab';
import { ProjectCommentsTab } from '@/components/features/project/project-comments-tab';
import { ProjectRemindersTab } from '@/components/features/project/project-reminders-tab';

interface Props {
  id: string;
}

/** 全ロール共通のカスタムタブ */
const COMMON_CUSTOM_TABS = {
  movements: ProjectMovementsTab,
  files: ProjectFilesTab,
};

/** admin/staff 限定のカスタムタブ */
const INTERNAL_CUSTOM_TABS = {
  ...COMMON_CUSTOM_TABS,
  reminders: ProjectRemindersTab,
  comments: ProjectCommentsTab,
  customerInfo: ProjectCustomerInfoTab,
  partnerInfo: ProjectPartnerInfoTab,
  otherProjects: ProjectOtherProjectsTab,
};

const INTERNAL_ONLY_TAB_KEYS = new Set(['reminders', 'comments', 'customerInfo', 'partnerInfo', 'otherProjects']);

export function ProjectDetailClient({ id }: Props) {
  const router = useRouter();
  const { selectedBusinessId, hasHydrated } = useBusiness();
  const { detailConfig, isLoading } = useProjectConfig(selectedBusinessId);
  const { hasRole } = useAuth();
  const fromCrumb = useBreadcrumbFrom();

  // 事業未選択時はダッシュボードへリダイレクト（hydration完了後に判定）
  useEffect(() => {
    if (hasHydrated && !selectedBusinessId) {
      router.replace('/dashboard');
    }
  }, [hasHydrated, selectedBusinessId, router]);

  const isInternalUser = hasRole(['admin', 'staff']);

  // partner ロールには自社専用タブを非表示
  const filteredConfig = useMemo(() => {
    if (isInternalUser) return detailConfig;
    return {
      ...detailConfig,
      tabs: detailConfig.tabs.filter((tab) => !INTERNAL_ONLY_TAB_KEYS.has(tab.key)),
    };
  }, [detailConfig, isInternalUser]);

  if (!hasHydrated || !selectedBusinessId || isLoading) return <LoadingSpinner />;

  return (
    <EntityDetailTemplate
      config={filteredConfig}
      id={id}
      breadcrumbs={[
        ...(fromCrumb
          ? [fromCrumb]
          : [{ label: '案件一覧', href: '/projects' }]),
        { label: '案件詳細' },
      ]}
      customTabs={isInternalUser ? INTERNAL_CUSTOM_TABS : COMMON_CUSTOM_TABS}
    />
  );
}
