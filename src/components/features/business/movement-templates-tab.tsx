'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useMovementTemplates, type MovementTemplate } from '@/hooks/use-movement-templates';
import { useStatusDefinitions } from '@/hooks/use-status-definitions';
import { SortableItemList, type SortableItemColumn, type SortableItemFormField } from '@/components/shared/sortable-item-list';
import { TabCsvImport } from '@/components/shared/tab-csv-import';
import { Button } from '@/components/ui/button';
import { MOVEMENT_TEMPLATE_COLUMNS as MOVEMENT_CSV_COLUMNS } from '@/lib/csv-helpers';
import { useToast } from '@/hooks/use-toast';

interface Props {
  entityId: number;
}

export function MovementTemplatesTab({ entityId }: Props) {
  const { items, isLoading, create, update, remove, reorder, sync } = useMovementTemplates(entityId);
  const { items: statusItems } = useStatusDefinitions(entityId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const statusLabelMap = new Map(statusItems.map((s) => [s.statusCode, s.statusLabel]));

  const columns: SortableItemColumn<MovementTemplate>[] = [
    {
      key: 'stepNumber',
      label: 'No.',
      width: 50,
    },
    {
      key: 'stepCode',
      label: 'コード',
      width: 140,
    },
    {
      key: 'stepName',
      label: 'ステップ名',
    },
    {
      key: 'stepIsSalesLinked',
      label: 'ステータス連動',
      width: 100,
      render: (value) => (value ? '✓' : '-'),
    },
    {
      key: 'stepLinkedStatusCode',
      label: '連動先',
      width: 140,
      render: (value) => {
        if (!value) return '-';
        const code = String(value);
        return statusLabelMap.get(code) ?? code;
      },
    },
    {
      key: 'visibleToPartner',
      label: '代理店表示',
      width: 80,
      render: (value) => (value ? '✓' : '-'),
    },
    {
      key: 'stepIsActive',
      label: '有効',
      width: 60,
      render: (value) => (value ? '✓' : '-'),
    },
  ];

  const statusOptions = statusItems.map((s) => ({
    label: `${s.statusCode}: ${s.statusLabel}`,
    value: s.statusCode,
  }));

  const MOVEMENT_FORM_FIELDS: SortableItemFormField[] = [
    {
      key: 'stepCode',
      label: 'ステップコード',
      type: 'text',
      required: true,
      placeholder: '例：delivery_prep',
      description: '英数字・アンダースコアのみ。作成後は変更不可。',
    },
    {
      key: 'stepName',
      label: 'ステップ名',
      type: 'text',
      required: true,
      placeholder: '例：納品準備',
    },
    {
      key: 'stepDescription',
      label: '説明',
      type: 'textarea',
      placeholder: 'ステップの詳細説明',
    },
    {
      key: 'stepIsSalesLinked',
      label: '営業ステータス連動',
      type: 'checkbox',
      description: 'チェック時、このステップ完了で営業ステータスが変わります',
    },
    {
      key: 'stepLinkedStatusCode',
      label: '連動ステータスコード',
      type: 'select',
      options: statusOptions,
      placeholder: 'ステータスを選択...',
      description: '連動時に変更される営業ステータス',
      visibleWhen: (formData) => !!formData.stepIsSalesLinked,
    },
    {
      key: 'visibleToPartner',
      label: '代理店に表示',
      type: 'checkbox',
      description: 'チェック時、このステップが代理店ポータルに表示されます',
    },
    {
      key: 'stepIsActive',
      label: '有効',
      type: 'checkbox',
    },
  ];

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['movement-templates', entityId] });
    // ムーブメント関連キャッシュも無効化（CSVインポートで同期が実行されるため）
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as string;
        return (
          key === 'project-movements' ||
          key === 'project-movements-overview' ||
          key === 'portal-movements-overview'
        );
      },
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await sync();
      const messages: string[] = [];
      if (result.created > 0) messages.push(`${result.created}件追加`);
      if (result.deleted > 0) messages.push(`${result.deleted}件削除`);
      toast({
        message: messages.length > 0
          ? `ムーブメントを同期しました（${messages.join('、')}）`
          : 'すべての案件は同期済みです',
        type: 'success',
      });
    } catch {
      // エラーtoastはhook側で表示済み
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SortableItemList
      items={items}
      isLoading={isLoading}
      columns={columns}
      addLabel="テンプレートを追加"
      formFields={MOVEMENT_FORM_FIELDS}
      formTitle={{ create: 'テンプレート追加', edit: 'テンプレート編集' }}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
      onReorder={reorder}
      disabledOnEditKeys={['stepCode']}
      deleteConfirmMessage={(item) => `テンプレート「${(item as MovementTemplate).stepName}」を削除しますか？`}
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '同期中...' : '案件に同期'}
          </Button>
          <TabCsvImport
            endpoint={`/businesses/${entityId}/movement-templates/csv`}
            templateColumns={MOVEMENT_CSV_COLUMNS}
            onImportComplete={handleImportComplete}
          />
        </div>
      }
    />
  );
}
