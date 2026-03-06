'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useStatusDefinitions, type StatusDefinition } from '@/hooks/use-status-definitions';
import { SortableItemList, type SortableItemColumn, type SortableItemFormField } from '@/components/shared/sortable-item-list';
import { TabCsvImport } from '@/components/shared/tab-csv-import';
import { STATUS_DEFINITION_TEMPLATE_COLUMNS } from '@/lib/csv-helpers';

const STATUS_COLUMNS: SortableItemColumn<StatusDefinition>[] = [
  {
    key: 'statusCode',
    label: 'コード',
    width: 140,
  },
  {
    key: 'statusLabel',
    label: 'ラベル',
    width: 180,
  },
  {
    key: 'statusPriority',
    label: '優先順位',
    width: 80,
  },
  {
    key: 'statusColor',
    label: '色',
    width: 60,
    render: (value) => {
      if (!value) return '-';
      return (
        <span
          className="inline-block h-4 w-4 rounded-full border border-border"
          style={{ backgroundColor: String(value) }}
          title={String(value)}
        />
      );
    },
  },
  {
    key: 'statusIsFinal',
    label: '最終',
    width: 60,
    render: (value) => (value ? '✓' : '-'),
  },
  {
    key: 'statusIsLost',
    label: '失注',
    width: 60,
    render: (value) => (value ? '✓' : '-'),
  },
  {
    key: 'statusIsActive',
    label: '有効',
    width: 60,
    render: (value) => (value ? '✓' : '-'),
  },
];

const STATUS_FORM_FIELDS: SortableItemFormField[] = [
  {
    key: 'statusCode',
    label: 'ステータスコード',
    type: 'text',
    required: true,
    placeholder: '例：payment_confirmed',
    description: '英数字・アンダースコアのみ。作成後は変更不可。',
  },
  {
    key: 'statusLabel',
    label: '表示ラベル',
    type: 'text',
    required: true,
    placeholder: '例：2.入金確定',
  },
  {
    key: 'statusPriority',
    label: '優先順位',
    type: 'number',
    required: true,
    placeholder: '1',
    description: '数値が小さいほど高い順位（1が最優先）',
  },
  {
    key: 'statusColor',
    label: '表示色',
    type: 'color',
  },
  {
    key: 'statusIsFinal',
    label: '最終ステータス',
    type: 'checkbox',
    description: '複数設定可（購入済・失注・断念など）',
  },
  {
    key: 'statusIsLost',
    label: '失注ステータス',
    type: 'checkbox',
    description: '複数設定可（失注・断念など）',
  },
  {
    key: 'statusIsActive',
    label: '有効',
    type: 'checkbox',
  },
];

interface Props {
  entityId: number;
}

export function StatusDefinitionsTab({ entityId }: Props) {
  const { items, isLoading, create, update, remove, reorder } = useStatusDefinitions(entityId);
  const queryClient = useQueryClient();

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['status-definitions', entityId] });
  };

  return (
    <SortableItemList
      items={items}
      isLoading={isLoading}
      columns={STATUS_COLUMNS}
      addLabel="ステータスを追加"
      formFields={STATUS_FORM_FIELDS}
      formTitle={{ create: 'ステータス追加', edit: 'ステータス編集' }}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
      onReorder={reorder}
      disabledOnEditKeys={['statusCode']}
      deleteConfirmMessage={(item) => `ステータス「${(item as StatusDefinition).statusLabel}」を削除しますか？`}
      headerActions={
        <TabCsvImport
          endpoint={`/businesses/${entityId}/status-definitions/csv`}
          templateColumns={STATUS_DEFINITION_TEMPLATE_COLUMNS}
          onImportComplete={handleImportComplete}
        />
      }
    />
  );
}
