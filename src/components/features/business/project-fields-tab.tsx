'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useProjectFieldDefinitions } from '@/hooks/use-project-field-definitions';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';
import { SortableItemList, type SortableItemColumn, type SortableItemFormField } from '@/components/shared/sortable-item-list';
import { TabCsvImport } from '@/components/shared/tab-csv-import';
import { PROJECT_FIELD_TEMPLATE_COLUMNS } from '@/lib/csv-helpers';

const FIELD_TYPE_OPTIONS = [
  { label: 'テキスト', value: 'text' },
  { label: 'テキストエリア', value: 'textarea' },
  { label: '数値', value: 'number' },
  { label: '日付', value: 'date' },
  { label: '年月', value: 'month' },
  { label: '選択（ドロップダウン）', value: 'select' },
  { label: 'チェックボックス', value: 'checkbox' },
  { label: 'URL', value: 'url' },
];

type ProjectFieldDefinitionWithId = ProjectFieldDefinition & { id: string };

const FIELD_COLUMNS: SortableItemColumn<ProjectFieldDefinitionWithId>[] = [
  {
    key: 'key',
    label: 'キー',
    width: 140,
  },
  {
    key: 'label',
    label: 'ラベル',
    width: 180,
  },
  {
    key: 'type',
    label: '型',
    width: 100,
    render: (value) => {
      const opt = FIELD_TYPE_OPTIONS.find((o) => o.value === value);
      return opt?.label ?? String(value);
    },
  },
  {
    key: 'required',
    label: '必須',
    width: 60,
    render: (value) => (value ? '✓' : '-'),
  },
  {
    key: 'visibleToPartner',
    label: '代理店表示',
    width: 90,
    render: (value) => (value ? '✓' : '-'),
  },
];

const FIELD_FORM_FIELDS: SortableItemFormField[] = [
  {
    key: 'key',
    label: 'フィールドキー',
    type: 'text',
    required: true,
    placeholder: '例：project_amount',
    description: '英数字・アンダースコアのみ。project_custom_data のJSONキー。作成後は変更不可。',
  },
  {
    key: 'label',
    label: '表示ラベル',
    type: 'text',
    required: true,
    placeholder: '例：案件金額',
  },
  {
    key: 'type',
    label: '型',
    type: 'select',
    required: true,
    options: FIELD_TYPE_OPTIONS,
    description: '型は作成後は変更不可',
  },
  {
    key: 'options',
    label: '選択肢',
    type: 'textarea',
    placeholder: '選択肢1\n選択肢2\n選択肢3',
    description: '1行に1つの選択肢を入力（型=選択の場合のみ使用）',
    visibleWhen: (formData) => formData.type === 'select',
  },
  {
    key: 'required',
    label: '必須',
    type: 'checkbox',
  },
  {
    key: 'description',
    label: '説明（入力ヒント）',
    type: 'text',
    placeholder: '例：税込金額を入力してください',
  },
  {
    key: 'visibleToPartner',
    label: '代理店に表示する',
    type: 'checkbox',
  },
];

interface Props {
  entityId: number;
}

export function ProjectFieldsTab({ entityId }: Props) {
  const { items, isLoading, create, update, remove, reorder } = useProjectFieldDefinitions(entityId);
  const queryClient = useQueryClient();

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['business', entityId] });
  };

  return (
    <SortableItemList
      items={items as ProjectFieldDefinitionWithId[]}
      isLoading={isLoading}
      columns={FIELD_COLUMNS}
      addLabel="フィールドを追加"
      formFields={FIELD_FORM_FIELDS}
      formTitle={{ create: 'フィールド追加', edit: 'フィールド編集' }}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
      onReorder={reorder}
      disabledOnEditKeys={['key', 'type']}
      deleteConfirmMessage={(item) =>
        `フィールド「${(item as ProjectFieldDefinitionWithId).label}」を削除しますか？既存案件のデータは保持されます。`
      }
      headerActions={
        <TabCsvImport
          endpoint={`/businesses/${entityId}/project-fields/csv`}
          templateColumns={PROJECT_FIELD_TEMPLATE_COLUMNS}
          onImportComplete={handleImportComplete}
        />
      }
    />
  );
}
