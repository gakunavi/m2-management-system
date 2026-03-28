'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEntityFieldDefinitions } from '@/hooks/use-entity-field-definitions';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';
import { SortableItemList, type SortableItemColumn, type SortableItemFormField } from '@/components/shared/sortable-item-list';
import { TabCsvImport } from '@/components/shared/tab-csv-import';

const FIELD_TYPE_OPTIONS = [
  { label: 'テキスト', value: 'text' },
  { label: 'テキストエリア', value: 'textarea' },
  { label: '数値', value: 'number' },
  { label: '日付', value: 'date' },
  { label: '年月', value: 'month' },
  { label: '選択（ドロップダウン）', value: 'select' },
  { label: 'チェックボックス', value: 'checkbox' },
  { label: 'URL', value: 'url' },
  { label: '計算（数式）', value: 'formula' },
];

type EntityFieldDefinitionWithId = EntityFieldDefinition & { id: string };

type EntityType = 'project' | 'customer' | 'partner';
type ConfigKey = 'projectFields' | 'customerFields' | 'partnerFields';

const ENTITY_TYPE_TO_CONFIG_KEY: Record<EntityType, ConfigKey> = {
  project: 'projectFields',
  customer: 'customerFields',
  partner: 'partnerFields',
};

const CSV_ENDPOINT_SUFFIX: Record<EntityType, string> = {
  project: 'project-fields',
  customer: 'customer-fields',
  partner: 'partner-fields',
};

const ENTITY_LABEL: Record<EntityType, string> = {
  project: '案件',
  customer: '顧客',
  partner: '代理店',
};

function buildColumns(entityType: EntityType): SortableItemColumn<EntityFieldDefinitionWithId>[] {
  const cols: SortableItemColumn<EntityFieldDefinitionWithId>[] = [
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
      key: 'formula',
      label: '計算式',
      width: 160,
      render: (value) => (value ? String(value) : '-'),
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

  if (entityType === 'project') {
    cols.push({
      key: 'visibleToPartner',
      label: '代理店表示',
      width: 90,
      render: (value) => (value ? '✓' : '-'),
    });
  } else {
    // 顧客/代理店: 契約マスタ表示フラグ
    cols.push({
      key: 'showOnProject',
      label: '契約表示',
      width: 80,
      render: (value) => (value ? '✓' : '-'),
    });
    cols.push({
      key: 'visibleToPartner',
      label: '代理店表示',
      width: 90,
      render: (value) => (value ? '✓' : '-'),
    });
  }

  return cols;
}

function buildFormFields(entityType: EntityType): SortableItemFormField[] {
  const label = ENTITY_LABEL[entityType];
  const formFields: SortableItemFormField[] = [
    {
      key: 'key',
      label: 'フィールドキー',
      type: 'text',
      required: true,
      placeholder: entityType === 'project' ? '例：project_amount' : `例：${entityType}_category`,
      description: `英数字・アンダースコアのみ。${label}カスタムデータのJSONキー。作成後は変更不可。`,
    },
    {
      key: 'label',
      label: '表示ラベル',
      type: 'text',
      required: true,
      placeholder: entityType === 'project' ? '例：案件金額' : `例：${label}カテゴリ`,
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
      key: 'formula',
      label: '計算式',
      type: 'text',
      required: true,
      placeholder: '例：unit_price * quantity',
      description: '他のフィールドキーと四則演算（+, -, *, /）、括弧が使えます',
      visibleWhen: (formData) => formData.type === 'formula',
      renderAddon: ({ value, setField, items, editItemId }) => {
        const allFields = items as EntityFieldDefinitionWithId[];
        const refFields = allFields.filter(
          (f) => f.id !== editItemId && (f.type === 'number' || f.type === 'formula'),
        );
        if (refFields.length === 0) return null;
        return (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-1.5">フィールドを挿入:</p>
            <div className="flex flex-wrap gap-1.5">
              {refFields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-muted/50 px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => {
                    const current = ((value as string) ?? '').trim();
                    const newValue = current ? `${current} ${f.key}` : f.key;
                    setField('formula', newValue);
                  }}
                >
                  <span className="font-medium">{f.label}</span>
                  <span className="text-muted-foreground">{f.key}</span>
                </button>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      key: 'required',
      label: '必須',
      type: 'checkbox',
      visibleWhen: (formData) => formData.type !== 'formula',
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
      description: '一覧画面のフィルターに追加されます（select型・チェックボックス型推奨）',
    },
  ];

  if (entityType !== 'project') {
    formFields.push({
      key: 'showOnProject',
      label: '契約マスタにも表示する',
      type: 'checkbox',
      description: '契約マスタ一覧・詳細に読み取り専用で表示されます',
    });
  }

  formFields.push({
    key: 'visibleToPartner',
    label: '代理店に表示する',
    type: 'checkbox',
  });

  return formFields;
}

// CSV テンプレート列定義
const PROJECT_FIELD_TEMPLATE_COLUMNS = [
  { key: 'key', label: 'フィールドキー', required: true, example: 'field_name' },
  { key: 'label', label: '表示ラベル', required: true, example: 'フィールド名' },
  { key: 'type', label: '型', required: true, example: '数値' },
  { key: 'options', label: '選択肢（カンマ区切り）', required: false, example: '' },
  { key: 'formula', label: '計算式', required: false, example: '' },
  { key: 'required', label: '必須', required: false, example: '0' },
  { key: 'description', label: '説明', required: false, example: '' },
  { key: 'sortOrder', label: '表示順', required: false, example: '0' },
  { key: 'visibleToPartner', label: '代理店表示', required: false, example: '1' },
];

interface Props {
  entityId: number;
  entityType?: EntityType;
}

export function EntityFieldsTab({ entityId, entityType = 'project' }: Props) {
  const configKey = ENTITY_TYPE_TO_CONFIG_KEY[entityType];
  const { items, isLoading, create, update, remove, reorder } = useEntityFieldDefinitions(entityId, configKey);
  const queryClient = useQueryClient();
  const label = ENTITY_LABEL[entityType];

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['business', entityId] });
  };

  const csvEndpoint = `/businesses/${entityId}/${CSV_ENDPOINT_SUFFIX[entityType]}/csv`;

  return (
    <SortableItemList
      items={items as EntityFieldDefinitionWithId[]}
      isLoading={isLoading}
      columns={buildColumns(entityType)}
      addLabel="フィールドを追加"
      formFields={buildFormFields(entityType)}
      formTitle={{ create: 'フィールド追加', edit: 'フィールド編集' }}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
      onReorder={reorder}
      disabledOnEditKeys={['key', 'type']}
      deleteConfirmMessage={(item) =>
        `フィールド「${(item as EntityFieldDefinitionWithId).label}」を削除しますか？既存${label}のデータは保持されます。`
      }
      headerActions={
        entityType === 'project' ? (
          <TabCsvImport
            endpoint={csvEndpoint}
            templateColumns={PROJECT_FIELD_TEMPLATE_COLUMNS}
            onImportComplete={handleImportComplete}
          />
        ) : undefined
      }
    />
  );
}
