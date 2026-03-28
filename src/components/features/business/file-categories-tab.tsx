'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useFileCategories } from '@/hooks/use-file-categories';
import { SortableItemList, type SortableItemColumn, type SortableItemFormField } from '@/components/shared/sortable-item-list';
import { AiCodeGenerateButton } from '@/components/shared/ai-code-generate-button';
import { TabCsvImport } from '@/components/shared/tab-csv-import';
import { FILE_CATEGORY_TEMPLATE_COLUMNS } from '@/lib/csv-helpers';

interface FileCategoryItem {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
}

const COLUMNS: SortableItemColumn<FileCategoryItem>[] = [
  {
    key: 'key',
    label: 'キー',
    width: 200,
  },
  {
    key: 'label',
    label: '表示名',
    width: 300,
  },
];

const FORM_FIELDS: SortableItemFormField[] = [
  {
    key: 'label',
    label: '表示名',
    type: 'text',
    required: true,
    placeholder: '例：チェックリスト',
  },
  {
    key: 'key',
    label: 'カテゴリキー',
    type: 'text',
    required: true,
    placeholder: '例：checklist',
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
];

interface Props {
  entityId: number;
}

export function FileCategoriesTab({ entityId }: Props) {
  const queryClient = useQueryClient();
  const { items, isLoading, create, update, remove, reorder } = useFileCategories(entityId);

  const headerActions = (
    <TabCsvImport
      endpoint={`/businesses/${entityId}/file-categories/csv`}
      templateColumns={FILE_CATEGORY_TEMPLATE_COLUMNS}
      onImportComplete={() => {
        queryClient.invalidateQueries({ queryKey: ['business', entityId] });
      }}
    />
  );

  return (
    <SortableItemList
      items={items}
      isLoading={isLoading}
      columns={COLUMNS}
      addLabel="カテゴリを追加"
      formFields={FORM_FIELDS}
      formTitle={{ create: 'ファイルカテゴリ追加', edit: 'ファイルカテゴリ編集' }}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
      onReorder={reorder}
      disabledOnEditKeys={['key']}
      deleteConfirmMessage={(item) => `カテゴリ「${item.label}」を削除しますか？`}
      headerActions={headerActions}
    />
  );
}
