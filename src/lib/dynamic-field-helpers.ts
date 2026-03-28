import type { FormFieldDef, ColumnDef, CellEditConfig, FilterDef } from '@/types/config';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// DynamicFieldOptions: エンティティ種別に応じた動的生成オプション
// ============================================

export interface DynamicFieldOptions {
  /** 行データ上のJSONプロパティ名（例: 'projectCustomData', 'linkCustomData'） */
  dataKey: string;
  /** インラインPATCH先。null で読み取り専用 */
  patchEndpoint: ((row: Record<string, unknown>) => string) | null;
  /** PATCH ボディのフィールドパス（例: 'projectCustomData', 'linkCustomData'） */
  patchFieldPrefix: string;
  /** 列表示設定モーダル用のグループ名 */
  columnGroup?: string;
  /** 列キーのプレフィックス（名前空間衝突回避。例: 'customerLink'） */
  columnKeyPrefix?: string;
  /** インラインPATCH時にボディに追加するフィールド（例: { businessId: 1 }） */
  patchExtraBody?: Record<string, unknown>;
}

/** 契約マスタ（既存互換）のデフォルトオプション */
const DEFAULT_OPTIONS: DynamicFieldOptions = {
  dataKey: 'projectCustomData',
  patchEndpoint: (row) => `/projects/${row.id}`,
  patchFieldPrefix: 'projectCustomData',
};

function resolveOptions(opts?: Partial<DynamicFieldOptions>): DynamicFieldOptions {
  if (!opts) return DEFAULT_OPTIONS;
  return { ...DEFAULT_OPTIONS, ...opts };
}

/** 列キーを生成。prefix が指定されていれば `prefix_key`、なければ `customData_key` */
function colKey(fieldKey: string, opts: DynamicFieldOptions): string {
  const prefix = opts.columnKeyPrefix || 'customData';
  return `${prefix}_${fieldKey}`;
}

// ============================================
// フォームフィールド生成
// ============================================

/**
 * フィールド定義から FormFieldDef 配列を生成する。
 * EntityFormConfig の sections に追加するために使用。
 */
export function buildFormFields(
  fields: EntityFieldDefinition[],
  opts?: Partial<DynamicFieldOptions>,
): FormFieldDef[] {
  const o = resolveOptions(opts);
  return fields
    .filter((f) => f.type !== 'formula') // formula型はフォームに表示しない
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => {
      const base: FormFieldDef = {
        key: `${o.dataKey}.${field.key}`,
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
  type: EntityFieldDefinition['type']
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
    case 'formula':  return 'text'; // フォームには表示しないが型安全のため
    default:         return 'text';
  }
}

// ============================================
// テーブル列生成
// ============================================

/**
 * フィールド定義から ColumnDef 配列を生成する。
 * EntityListConfig の columns に追加するために使用。
 * opts.patchEndpoint が null の場合は読み取り専用（edit/customPatch なし）。
 */
export function buildDynamicColumns(
  fields: EntityFieldDefinition[],
  opts?: Partial<DynamicFieldOptions>,
): ColumnDef[] {
  const o = resolveOptions(opts);
  const readOnly = o.patchEndpoint === null;

  return fields
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => {
      const key = colKey(field.key, o);

      // formula型: 読み取り専用・計算値をサーバー側で注入済み
      if (field.type === 'formula') {
        return {
          key,
          label: field.label,
          width: getDefaultWidth(field.type),
          sortable: true,
          defaultVisible: false,
          group: o.columnGroup,
          render: (_value: unknown, row: Record<string, unknown>) => {
            const val = row[key];
            return formatDynamicValue(val, 'formula');
          },
        } satisfies ColumnDef;
      }

      const col: ColumnDef = {
        key,
        label: field.label,
        width: getDefaultWidth(field.type),
        sortable: true,
        defaultVisible: false,
        group: o.columnGroup,
        // URL型: render を提供せず EditableCell のネイティブURL表示に委任
        ...(field.type !== 'url' && {
          render: (_value: unknown, row: Record<string, unknown>) => {
            const customData = row[o.dataKey] as Record<string, unknown> | null;
            const val = customData?.[field.key];
            return formatDynamicValue(val, field.type);
          },
        }),
        ...(readOnly ? {} : {
          edit: buildDynamicCellEdit(field),
          customPatch: {
            endpoint: o.patchEndpoint!,
            field: `${o.patchFieldPrefix}.${field.key}`,
            ...(o.patchExtraBody ? { extraBody: o.patchExtraBody } : {}),
          },
        }),
      };
      return col;
    });
}

// ============================================
// フィルター生成
// ============================================

/**
 * filterable フラグが true のフィールド定義から FilterDef 配列を生成する。
 * select → multi-select フィルター、checkbox → boolean フィルター、text → text フィルター。
 */
export function buildDynamicFilters(
  fields: EntityFieldDefinition[],
  keyPrefix?: string,
): FilterDef[] {
  const prefix = keyPrefix || 'customField';
  return fields
    .filter((f) => f.filterable)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field): FilterDef => {
      const filterKey = `${prefix}_${field.key}`;
      switch (field.type) {
        case 'select':
          return {
            key: filterKey,
            label: field.label,
            type: 'multi-select' as const,
            options: (field.options ?? []).map((opt) => ({ label: opt, value: opt })),
          };
        case 'checkbox':
          return {
            key: filterKey,
            label: field.label,
            type: 'boolean' as const,
            trueLabel: 'あり',
            falseLabel: 'なし',
          };
        default:
          return {
            key: filterKey,
            label: field.label,
            type: 'text' as const,
            placeholder: `${field.label}で検索`,
            debounceMs: 300,
          };
      }
    });
}

function getDefaultWidth(type: EntityFieldDefinition['type']): number {
  switch (type) {
    case 'textarea': return 200;
    case 'number':   return 120;
    case 'date':     return 130;
    case 'month':    return 120;
    case 'checkbox': return 80;
    case 'url':      return 120;
    case 'formula':  return 120;
    default:         return 160;
  }
}

export function formatDynamicValue(
  value: unknown,
  type: EntityFieldDefinition['type']
): string {
  if (value == null) return '-';
  switch (type) {
    case 'checkbox': return value ? '✓' : '-';
    case 'number':
    case 'formula':  return Number(value).toLocaleString();
    default:         return String(value);
  }
}

function buildDynamicCellEdit(
  field: EntityFieldDefinition
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
  fields: EntityFieldDefinition[],
  opts?: Partial<DynamicFieldOptions>,
): FieldDisplayDef[] {
  const o = resolveOptions(opts);
  return fields
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => ({
      key: field.type === 'formula' ? colKey(field.key, o) : `${o.dataKey}.${field.key}`,
      label: field.label,
      type: 'text' as const,
      render: (_value: unknown, data: Record<string, unknown>) => {
        if (field.type === 'formula') {
          const val = data[colKey(field.key, o)];
          return formatDynamicValue(val, 'formula') as React.ReactNode;
        }
        const customData = data[o.dataKey] as Record<string, unknown> | null;
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
  fields: EntityFieldDefinition[]
): CsvTemplateColumn[] {
  return fields
    .filter((f) => f.type !== 'formula') // formula型はCSVインポート対象外
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
  fields: EntityFieldDefinition[]
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
 * フォームデータからカスタムデータを構築する。
 */
export function extractCustomData(
  formData: Record<string, unknown>,
  fields: EntityFieldDefinition[],
  dataKey = 'projectCustomData',
): Record<string, unknown> {
  const customData: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'formula') continue; // formula型はスキップ
    const formKey = `${dataKey}.${field.key}`;
    if (formKey in formData) {
      customData[field.key] = formData[formKey];
    }
  }
  return customData;
}

/**
 * カスタムデータをフォームデータに展開する。
 */
export function expandCustomData(
  customData: Record<string, unknown>,
  fields: EntityFieldDefinition[],
  dataKey = 'projectCustomData',
): Record<string, unknown> {
  const expanded: Record<string, unknown> = {};
  for (const field of fields) {
    expanded[`${dataKey}.${field.key}`] = customData[field.key] ?? null;
  }
  return expanded;
}
