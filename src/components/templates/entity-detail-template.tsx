'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EntityDetailConfig, InfoTabConfig, RelatedTabConfig } from '@/types/config';
import { useEntityDetail } from '@/hooks/use-entity-detail';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { RelatedTabContent } from '@/components/ui/related-tab-content';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { UserRole } from '@/hooks/use-auth';

interface EntityDetailTemplateProps {
  config: EntityDetailConfig;
  id: string;
  breadcrumbs?: { label: string; href?: string }[];
  /** component: 'custom' タブのキーとコンポーネントのマップ */
  customTabs?: Record<string, React.ComponentType<{ entityId: number }>>;
}

export function EntityDetailTemplate({ config, id, breadcrumbs, customTabs }: EntityDetailTemplateProps) {
  const router = useRouter();
  const { canEdit, canDelete, hasRole } = useAuth();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useEntityDetail(config, id);
  const entityPath = config.basePath ?? `/${config.entityType}s`;
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [activeTab, setActiveTab] = useState(config.tabs[0]?.key ?? '');

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error.message} onRetry={refresh} />;
  if (!data) return <ErrorDisplay message="データが見つかりません" />;

  const title = config.title(data as Record<string, unknown>);

  // 論理削除の復元判定
  const restoreConfig = config.actions.restore;
  const isDeleted = restoreConfig
    ? !(data as Record<string, unknown>)[restoreConfig.activeField]
    : false;
  const canRestore =
    restoreConfig && isDeleted &&
    (!restoreConfig.requiredRole?.length || restoreConfig.requiredRole.some((r) => hasRole(r as UserRole)));

  const handleRestore = async () => {
    if (!restoreConfig) return;
    setIsRestoring(true);
    try {
      const response = await fetch(`/api/v1${restoreConfig.apiEndpoint(id)}`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? '復元に失敗しました');
      }
      toast({ message: '復元しました', type: 'success' });
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : '復元に失敗しました';
      toast({ title: 'エラー', message, type: 'error' });
    } finally {
      setIsRestoring(false);
      setShowRestoreModal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 削除済みバナー */}
      {isDeleted && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 sm:px-4 sm:py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-destructive font-medium">
            このデータは削除（無効化）されています
          </span>
          {canRestore && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setShowRestoreModal(true)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              復元する
            </Button>
          )}
        </div>
      )}

      <PageHeader
        title={title}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            {config.actions.edit && canEdit && !isDeleted && (
              <Button
                variant="outline"
                onClick={() => router.push(`${entityPath}/${id}/edit`)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                編集
              </Button>
            )}
            {config.actions.delete && canDelete && !isDeleted && (
              <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                削除
              </Button>
            )}
          </div>
        }
      />

      {/* タブ */}
      {config.tabs.length > 1 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {config.tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {config.tabs.map((tab) => {
            // customTabs にキーが存在する場合はカスタムコンポーネントを優先
            const CustomOverride = customTabs?.[tab.key];
            if (CustomOverride) {
              return (
                <TabsContent key={tab.key} value={tab.key}>
                  <CustomOverride entityId={parseInt(id, 10)} />
                </TabsContent>
              );
            }

            return (
              <TabsContent key={tab.key} value={tab.key}>
                {tab.component === 'info' && (
                  <InfoTabContent
                    config={tab.config as InfoTabConfig}
                    data={data as Record<string, unknown>}
                  />
                )}
                {tab.component === 'related' && (
                  <RelatedTabContent
                    config={tab.config as RelatedTabConfig}
                    parentId={id}
                  />
                )}
                {(tab.component === 'custom' || tab.component === 'contacts') && (
                  <div className="text-muted-foreground text-sm py-8 text-center">
                    このタブはカスタムコンポーネントが必要です
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        config.tabs[0]?.component === 'info' && (
          <InfoTabContent
            config={config.tabs[0].config as InfoTabConfig}
            data={data as Record<string, unknown>}
          />
        )
      )}

      {/* 削除確認モーダル */}
      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="データを削除しますか？"
        description="このデータを無効化します。管理者は後から復元できます。"
        confirmLabel="削除する"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await fetch(`/api/v1${entityPath}/${id}`, { method: 'DELETE' });
            toast({ message: '削除しました', type: 'success' });
            router.push(`${entityPath}`);
          } catch {
            toast({ message: '削除に失敗しました', type: 'error' });
          } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
          }
        }}
      />

      {/* 復元確認モーダル */}
      <ConfirmModal
        open={showRestoreModal}
        onOpenChange={setShowRestoreModal}
        title="データを復元しますか？"
        description="このデータを有効な状態に復元します。"
        confirmLabel="復元する"
        onConfirm={handleRestore}
        isLoading={isRestoring}
      />
    </div>
  );
}

export function InfoTabContent({
  config,
  data,
}: {
  config: InfoTabConfig;
  data: Record<string, unknown>;
}) {
  return (
    <div className="space-y-6">
      {config.sections.map((section, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 pb-2 sm:pb-3 border-b">{section.title}</h3>
          <dl
            className={`grid gap-4 ${
              section.columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {section.fields.map((field) => (
              <div key={field.key} className={field.colSpan === 2 ? 'sm:col-span-2' : ''}>
                <dt className="text-sm text-muted-foreground">{field.label}</dt>
                <dd className="mt-1 text-sm font-medium">
                  {field.render
                    ? field.render(data[field.key], data)
                    : formatFieldValue(data[field.key], field.type)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function formatFieldValue(value: unknown, type?: string): React.ReactNode {
  if (value == null || value === '') return '-';
  switch (type) {
    case 'currency':
      return formatCurrency(value as number);
    case 'date':
      return formatDate(value as string);
    case 'boolean':
      return value ? 'はい' : 'いいえ';
    case 'url':
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4 hover:text-primary/80 break-all"
        >
          {String(value)}
        </a>
      );
    case 'email':
      return (
        <a
          href={`mailto:${String(value)}`}
          className="text-primary underline underline-offset-4 hover:text-primary/80"
        >
          {String(value)}
        </a>
      );
    case 'phone':
      return (
        <a
          href={`tel:${String(value).replace(/[-\s]/g, '')}`}
          className="text-primary underline underline-offset-4 hover:text-primary/80"
        >
          {String(value)}
        </a>
      );
    default:
      return String(value);
  }
}
