import type { FormFieldDef, ColumnDef, CellEditConfig } from '@/types/config';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// フォームフィールド生成
// ============================================

/**
 * フィールド定義から FormFieldDef 配列を生成する。
 * EntityFormConfig の sections に追加するために使用。
 */
export function buildFormFields(fields: ProjectFieldDefinition[]): FormFieldDef[] {
  return fields
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => {
      const base: FormFieldDef = {
        key: `customData.${field.key}`,
        label: field.label,
        type: mapFieldType(field.type),
        required: field.required ?? false,
        placeholder: field.description,
      };

      if (field.type === 'select' && field.options) {
        base.options = field.options.map((opt) => ({
          label: opt,
          value: opt,
        }));
      }

      return base;
    });
}

function mapFieldType(
  type: ProjectFieldDefinition['type']
): FormFieldDef['type'] {
  switch (type) {
    case 'text':     return 'text';
    case 'textarea': return 'textarea';
    case 'number':   return 'number';
    case 'date':     return 'date';
    case 'month':    return 'month';
    case 'select':   return 'select';
    case 'checkbox': return 'checkbox';
    case 'url':      return 'url';
    default:         return 'text';
  }
}

// ============================================
// テーブル列生成
// ============================================

/**
 * フィールド定義から ColumnDef 配列を生成する。
 * EntityListConfig の columns に追加するために使用。
 */
export function buildDynamicColumns(fields: ProjectFieldDefinition[]): ColumnDef[] {
  return fields
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => {
      const col: ColumnDef = {
        key: `customData_${field.key}`,
        label: field.label,
        width: getDefaultWidth(field.type),
        sortable: true,
        defaultVisible: false,
        // URL型: render を提供せず EditableCell のネイティブURL表示（青文字+アイコン+truncate）に委任
        // ※ API レスポンスで customData_* キーにフラット展開済みなので value が取れる
        ...(field.type !== 'url' && {
          render: (_value: unknown, row: Record<string, unknown>) => {
            const customData = row.projectCustomData as Record<string, unknown> | null;
            const val = customData?.[field.key];
            return formatDynamicValue(val, field.type);
          },
        }),
        edit: buildDynamicCellEdit(field),
        customPatch: {
          endpoint: (row: Record<string, unknown>) => `/projects/${row.id}`,
          field: `projectCustomData.${field.key}`,
        },
      };
      return col;
    });
}

function getDefaultWidth(type: ProjectFieldDefinition['type']): number {
  switch (type) {
    case 'textarea': return 200;
    case 'number':   return 120;
    case 'date':     return 130;
    case 'month':    return 120;
    case 'checkbox': return 80;
    case 'url':      return 120;
    default:         return 160;
  }
}

export function formatDynamicValue(
  value: unknown,
  type: ProjectFieldDefinition['type']
): string {
  if (value == null) return '-';
  switch (type) {
    case 'checkbox': return value ? '✓' : '-';
    case 'number':   return Number(value).toLocaleString();
    default:         return String(value);
  }
}

function buildDynamicCellEdit(
  field: ProjectFieldDefinition
): CellEditConfig | undefined {
  switch (field.type) {
    case 'text':     return { type: 'text' };
    case 'textarea': return { type: 'textarea' };
    case 'number':   return { type: 'number' };
    case 'date':     return { type: 'date' };
    case 'month':    return { type: 'month' };
    case 'select':
      return {
        type: 'select',
        options: field.options?.map((opt) => ({ label: opt, value: opt })) ?? [],
      };
    case 'checkbox': return { type: 'checkbox' };
    case 'url':      return { type: 'url' };
    default:         return undefined;
  }
}

// ============================================
// 詳細表示フィールド生成
// ============================================

export type FieldDisplayDef = {
  key: string;
  label: string;
  type: string;
  colSpan?: 1 | 2 | 3;
  render?: (value: unknown, data: Record<string, unknown>) => React.ReactNode;
};

/**
 * フィールド定義から FieldDisplayDef 配列を生成する。
 * EntityDetailConfig の info タブに「事業固有情報」セクションとして追加。
 */
export function buildDynamicDisplayFields(
  fields: ProjectFieldDefinition[]
): FieldDisplayDef[] {
  return fields
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => ({
      key: `projectCustomData.${field.key}`,
      label: field.label,
      type: 'text' as const,
      render: (_value: unknown, data: Record<string, unknown>) => {
        const customData = data.projectCustomData as Record<string, unknown> | null;
        const val = customData?.[field.key];
        return formatDynamicValue(val, field.type) as React.ReactNode;
      },
    }));
}

// ============================================
// CSV列生成
// ============================================

export type CsvTemplateColumn = {
  key: string;
  label: string;
  required: boolean;
  description?: string;
  example?: string;
};

/**
 * フィールド定義からCSVのテンプレート列を生成する。
 */
export function buildDynamicCsvColumns(
  fields: ProjectFieldDefinition[]
): CsvTemplateColumn[] {
  return fields
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => ({
      key: field.key,
      label: field.label,
      required: field.required ?? false,
      description: field.description,
    }));
}

/**
 * CSVの日本語ヘッダーからフィールドキーへのマッピングを生成する。
 */
export function buildCsvLabelToKeyMap(
  fields: ProjectFieldDefinition[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of fields) {
    map[field.label] = field.key;
  }
  return map;
}

// ============================================
// フォームデータ変換
// ============================================

/**
 * フォームデータから projectCustomData を構築する。
 */
export function extractCustomData(
  formData: Record<string, unknown>,
  fields: ProjectFieldDefinition[]
): Record<string, unknown> {
  const customData: Record<string, unknown> = {};
  for (const field of fields) {
    const formKey = `customData.${field.key}`;
    if (formKey in formData) {
      customData[field.key] = formData[formKey];
    }
  }
  return customData;
}

/**
 * projectCustomData をフォームデータに展開する。
 */
export function expandCustomData(
  customData: Record<string, unknown>,
  fields: ProjectFieldDefinition[]
): Record<string, unknown> {
  const expanded: Record<string, unknown> = {};
  for (const field of fields) {
    expanded[`customData.${field.key}`] = customData[field.key] ?? null;
  }
  return expanded;
}
