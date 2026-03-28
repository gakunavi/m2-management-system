'use client';

import { useGlobalFieldDefinitions } from '@/hooks/use-global-field-definitions';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';
import { SortableItemList, type SortableItemColumn, type SortableItemFormField } from '@/components/shared/sortable-item-list';
import { AiCodeGenerateButton } from '@/components/shared/ai-code-generate-button';

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

type FieldWithId = EntityFieldDefinition & { id: string };

const COLUMNS: SortableItemColumn<FieldWithId>[] = [
  { key: 'key', label: 'キー', width: 140 },
  { key: 'label', label: 'ラベル', width: 180 },
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
    key: 'filterable',
    label: '絞り込み',
    width: 70,
    render: (value) => (value ? '✓' : '-'),
  },
];

const FORM_FIELDS: SortableItemFormField[] = [
  {
    key: 'label',
    label: '表示ラベル',
    type: 'text',
    required: true,
    placeholder: '例：業種規模',
  },
  {
    key: 'key',
    label: 'フィールドキー',
    type: 'text',
    required: true,
    placeholder: '例：industry_scale',
    description: '英数字・アンダースコアのみ。作成後は変更不可。',
    renderAfterLabel: ({ formData, setField, isEditing }) => {
      if (isEditing) return null;
      return (
        <AiCodeGenerateButton
          label={String(formData.label ?? '')}
          context="field_key"
          onGenerated={(code) => setField('key', code)}
        />
      );
    },
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
    placeholder: '例：入力値の説明',
  },
  {
    key: 'filterable',
    label: '絞り込みフィルターに表示する',
    type: 'checkbox',
    description: '一覧画面のフィルターに追加されます',
  },
  {
    key: 'visibleToPartner',
    label: '代理店に表示する',
    type: 'checkbox',
  },
];

interface Props {
  entityType: 'customer' | 'partner';
}

export function GlobalCustomFieldsTab({ entityType }: Props) {
  const { items, isLoading, create, update, remove, reorder } = useGlobalFieldDefinitions(entityType);
  const label = entityType === 'customer' ? '顧客' : '代理店';

  return (
    <SortableItemList
      items={items as FieldWithId[]}
      isLoading={isLoading}
      columns={COLUMNS}
      addLabel="フィールドを追加"
      formFields={FORM_FIELDS}
      formTitle={{ create: 'フィールド追加', edit: 'フィールド編集' }}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
      onReorder={reorder}
      disabledOnEditKeys={['key', 'type']}
      deleteConfirmMessage={(item) =>
        `フィールド「${(item as FieldWithId).label}」を削除しますか？既存${label}のデータは保持されます。`
      }
    />
  );
}
