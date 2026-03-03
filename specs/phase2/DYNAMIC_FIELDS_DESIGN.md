# Phase 2: 動的フィールド設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [06_PHASE2_PRD.md](../06_PHASE2_PRD.md) | Phase 2 全体PRD |
> | [BUSINESS_TABS_DESIGN.md](./BUSINESS_TABS_DESIGN.md) | 案件フィールド定義タブ |
> | [PROJECT_DESIGN.md](./PROJECT_DESIGN.md) | 案件マスタ設計 |

---

## 目次

1. [概要](#1-概要)
2. [データフロー](#2-データフロー)
3. [フィールド定義の型](#3-フィールド定義の型)
4. [動的フォーム生成](#4-動的フォーム生成)
5. [動的テーブル列生成](#5-動的テーブル列生成)
6. [動的詳細表示生成](#6-動的詳細表示生成)
7. [動的バリデーション](#7-動的バリデーション)
8. [動的CSV対応](#8-動的csv対応)
9. [useProjectConfig フック](#9-useprojectconfig-フック)
10. [実装チェックリスト](#10-実装チェックリスト)

---

## 1. 概要

事業マスタの「案件フィールド定義」で定義されたフィールドを、案件のフォーム・一覧・詳細・CSV に動的に反映する仕組み。

**キーコンセプト:**
- フィールド定義は `businesses.businessConfig.projectFields` に JSON で格納
- フィールドの値は `projects.projectCustomData` に JSON で格納
- フォーム・一覧・詳細の各画面で、定義に基づいて動的にUI要素を生成
- 共通固定項目（顧客・代理店・ステータス等）は静的Config、事業固有項目は動的生成

---

## 2. データフロー

```
┌─────────────────────────────┐
│ 事業マスタ                    │
│ businessConfig.projectFields │
│ [{ key, label, type, ... }]  │
└────────────┬────────────────┘
             │ 定義を読み取り
             ▼
┌─────────────────────────────┐
│ useProjectConfig(businessId) │
│                             │
│ ベースConfig + 動的フィールド  │
│ → listConfig（+列）          │
│ → formConfig（+フィールド）   │
│ → detailConfig（+表示項目）   │
│ → validationSchema（+Zod）   │
└────────────┬────────────────┘
             │ 拡張されたConfigを使用
             ▼
┌─────────────────────────────┐
│ EntityListTemplate           │
│ EntityFormTemplate           │
│ EntityDetailTemplate         │
│                             │
│ 静的項目 + 動的項目を描画     │
└─────────────────────────────┘
             │ 値の読み書き
             ▼
┌─────────────────────────────┐
│ projects.projectCustomData   │
│ { "key1": "value1", ... }   │
└─────────────────────────────┘
```

---

## 3. フィールド定義の型

```typescript
// src/types/dynamic-fields.ts

/**
 * 事業固有フィールドの定義。
 * businessConfig.projectFields に格納される。
 */
export interface ProjectFieldDefinition {
  /** JSONキー（project_custom_data のキー） */
  key: string;
  /** 表示ラベル */
  label: string;
  /** フィールドの型 */
  type: 'text' | 'textarea' | 'number' | 'date' | 'month' | 'select' | 'checkbox';
  /** select型の選択肢 */
  options?: string[];
  /** 入力必須か */
  required?: boolean;
  /** 入力ヒント・プレースホルダー */
  description?: string;
  /** 表示順 */
  sortOrder: number;
}
```

---

## 4. 動的フォーム生成

### 4.1 DynamicFormSection コンポーネント

`projectFields` の定義配列から `FormFieldDef[]` を生成し、EntityFormTemplate のセクションとして挿入する。

```typescript
// src/lib/dynamic-field-helpers.ts

/**
 * フィールド定義から FormFieldDef 配列を生成する。
 * EntityFormConfig の sections に追加するために使用。
 */
export function buildFormFields(
  fields: ProjectFieldDefinition[]
): FormFieldDef[] {
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

/**
 * ProjectFieldDefinition.type → FormFieldDef.type のマッピング
 */
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
    default:         return 'text';
  }
}
```

### 4.2 フォームデータの読み書き

事業固有フィールドは `projectCustomData` JSON に格納されるため、フォームの `setField` / `formData` とJSONの間の変換が必要。

```typescript
/**
 * フォームデータから projectCustomData を構築する。
 * formData の "customData.xxx" キーを projectCustomData に変換。
 *
 * 例:
 *   formData: { "customData.amount": 1000, "customData.name": "案件A" }
 *   → projectCustomData: { amount: 1000, name: "案件A" }
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
 * 詳細取得時に既存データをフォームにマッピング。
 *
 * 例:
 *   projectCustomData: { amount: 1000, name: "案件A" }
 *   → { "customData.amount": 1000, "customData.name": "案件A" }
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
```

### 4.3 API送信時の変換

```
フォーム送信時:
  1. formData から customData.* キーを抽出
  2. extractCustomData() で projectCustomData オブジェクトに変換
  3. 残りの共通項目と合わせて API に送信

API受信時（編集画面のデータ読み込み）:
  1. APIから projectCustomData を取得
  2. expandCustomData() でフォームキーに展開
  3. fetchedData にマージ
```

---

## 5. 動的テーブル列生成

### 5.1 buildDynamicColumns ヘルパー

```typescript
// src/lib/dynamic-field-helpers.ts

/**
 * フィールド定義から ColumnDef 配列を生成する。
 * EntityListConfig の columns に追加するために使用。
 */
export function buildDynamicColumns(
  fields: ProjectFieldDefinition[]
): ColumnDef[] {
  return fields
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => {
      const col: ColumnDef = {
        key: `customData_${field.key}`,
        label: field.label,
        width: getDefaultWidth(field.type),
        defaultVisible: false, // 事業固有列はデフォルト非表示
        render: (_value, row) => {
          const customData = row.projectCustomData as Record<string, unknown> | null;
          const val = customData?.[field.key];
          return formatDynamicValue(val, field.type);
        },
      };

      // インライン編集の設定
      col.edit = buildDynamicCellEdit(field);

      // customPatch で projectCustomData 内のキーを更新
      col.customPatch = {
        endpoint: (row) => `/projects/${row.id}`,
        field: `projectCustomData.${field.key}`,
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
    default:         return 160;
  }
}

function formatDynamicValue(
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
    default:         return undefined;
  }
}
```

### 5.2 インライン編集時のAPI

事業固有フィールドのインライン編集は `customPatch` パターンを使用:
- エンドポイント: `PATCH /api/v1/projects/{id}`
- ボディ: `{ "projectCustomData": { "fieldKey": newValue }, "version": N }`
- API側で `projectCustomData` のディープマージを実行（既存の他のキーを保持）

---

## 6. 動的詳細表示生成

### 6.1 buildDynamicDisplayFields ヘルパー

```typescript
// src/lib/dynamic-field-helpers.ts

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
        return formatDynamicValue(val, field.type);
      },
    }));
}
```

---

## 7. 動的バリデーション

### 7.1 buildDynamicFieldSchema

PROJECT_DESIGN.md セクション5.2 で定義済み。

要点:
- `projectFields` の定義から Zod スキーマを動的に構築
- `projectBaseSchema`（共通項目）とマージして完全なスキーマを生成
- `useProjectConfig` フック内で `useMemo` でメモ化

```typescript
// src/hooks/use-project-config.ts 内

const validationSchema = useMemo(() => {
  if (!projectFields.length) return projectBaseSchema;

  const dynamicSchema = buildDynamicFieldSchema(projectFields);
  return projectBaseSchema.extend({
    customData: dynamicSchema,
  });
}, [projectFields]);
```

---

## 8. 動的CSV対応

### 8.1 エクスポート

事業固有フィールドもCSV列として出力する。

```typescript
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
```

### 8.2 インポート

CSVインポート時に事業固有フィールドを `projectCustomData` にマッピングする。

```
CSV行: { "案件金額": "1000000", "案件名": "A社向け提案" }
       ↓ フィールド定義のラベル→キーで逆引き
projectCustomData: { "project_amount": 1000000, "project_name": "A社向け提案" }
```

```typescript
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
```

---

## 9. useProjectConfig フック

### 9.1 全体構造

```typescript
// src/hooks/use-project-config.ts

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  projectListConfig,
  projectDetailConfig,
  projectFormConfig,
} from '@/config/entities/project';
import {
  buildFormFields,
  buildDynamicColumns,
  buildDynamicDisplayFields,
  buildDynamicCsvColumns,
} from '@/lib/dynamic-field-helpers';
import { buildDynamicFieldSchema } from '@/lib/validations/dynamic-fields';
import { projectBaseSchema } from '@/lib/validations/project';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

interface UseProjectConfigResult {
  listConfig: EntityListConfig;
  detailConfig: EntityDetailConfig;
  formConfig: EntityFormConfig;
  statusDefinitions: StatusDefinition[];
  isLoading: boolean;
}

export function useProjectConfig(
  businessId: number | null
): UseProjectConfigResult {
  // 1. 事業の設定を取得
  const { data: businessData, isLoading: isLoadingBusiness } = useQuery({
    queryKey: ['business-config', businessId],
    queryFn: () => apiClient.get(`/businesses/${businessId}`),
    enabled: !!businessId,
  });

  // 2. 営業ステータス定義を取得
  const { data: statusDefs, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['status-definitions', businessId],
    queryFn: () =>
      apiClient.get(`/businesses/${businessId}/status-definitions`),
    enabled: !!businessId,
  });

  // 3. フィールド定義を抽出
  const projectFields: ProjectFieldDefinition[] = useMemo(
    () => businessData?.businessConfig?.projectFields ?? [],
    [businessData]
  );

  // 4. ステータス選択肢を構築
  const statusOptions = useMemo(
    () =>
      (statusDefs ?? []).map((s) => ({
        label: s.statusLabel,
        value: s.statusCode,
      })),
    [statusDefs]
  );

  // 5. 動的Config生成
  const listConfig = useMemo(() => {
    const dynamicColumns = buildDynamicColumns(projectFields);
    return {
      ...projectListConfig,
      columns: [...projectListConfig.columns, ...dynamicColumns],
      // ステータスフィルターの選択肢を注入
      filters: projectListConfig.filters.map((f) =>
        f.key === 'projectSalesStatus'
          ? { ...f, options: statusOptions }
          : f
      ),
      csv: {
        ...projectListConfig.csv,
        templateColumns: [
          ...(projectListConfig.csv?.templateColumns ?? []),
          ...buildDynamicCsvColumns(projectFields),
        ],
      },
    };
  }, [projectFields, statusOptions]);

  const formConfig = useMemo(() => {
    const dynamicFormFields = buildFormFields(projectFields);
    const dynamicSchema = projectFields.length
      ? projectBaseSchema.extend({
          customData: buildDynamicFieldSchema(projectFields),
        })
      : projectBaseSchema;

    return {
      ...projectFormConfig,
      sections: [
        // 基本情報セクション（ステータス選択肢を注入）
        {
          ...projectFormConfig.sections[0],
          fields: projectFormConfig.sections[0].fields.map((f) =>
            f.key === 'projectSalesStatus'
              ? { ...f, options: statusOptions }
              : f
          ),
        },
        // 事業固有フィールドセクション（動的生成）
        ...(dynamicFormFields.length > 0
          ? [{
              title: '事業固有項目',
              columns: 2,
              fields: dynamicFormFields,
            }]
          : []),
      ],
      validationSchema: dynamicSchema,
    };
  }, [projectFields, statusOptions]);

  const detailConfig = useMemo(() => {
    const dynamicDisplayFields = buildDynamicDisplayFields(projectFields);
    const infoTab = projectDetailConfig.tabs[0];

    return {
      ...projectDetailConfig,
      tabs: [
        {
          ...infoTab,
          config: {
            ...infoTab.config,
            sections: [
              ...infoTab.config.sections,
              ...(dynamicDisplayFields.length > 0
                ? [{
                    title: '事業固有情報',
                    columns: 2,
                    fields: dynamicDisplayFields,
                  }]
                : []),
            ],
          },
        },
        ...projectDetailConfig.tabs.slice(1),
      ],
    };
  }, [projectFields]);

  return {
    listConfig,
    detailConfig,
    formConfig,
    statusDefinitions: statusDefs ?? [],
    isLoading: isLoadingBusiness || isLoadingStatus,
  };
}
```

### 9.2 重要な設計判断

| 判断 | 理由 |
|------|------|
| ベースConfigは静的ファイルで定義 | IDE補完が効く。静的解析可能。事業未選択時のフォールバック |
| 動的部分はフックでマージ | 事業変更時にConfigが自動更新される |
| `useMemo` でメモ化 | 不要な再レンダリングを防止 |
| `customData.` プレフィックスでフォームキーを分離 | 共通項目と事業固有項目の名前衝突を防止 |
| 事業固有列はデフォルト非表示 | 列が多すぎて初期表示が崩れるのを防止 |

---

## 10. 実装チェックリスト

### 型定義
- [ ] `ProjectFieldDefinition` 型定義
- [ ] 既存の `FormFieldDef` / `ColumnDef` 型が動的生成に対応するか確認

### ヘルパー関数
- [ ] `buildFormFields()` — フィールド定義 → FormFieldDef 変換
- [ ] `buildDynamicColumns()` — フィールド定義 → ColumnDef 変換
- [ ] `buildDynamicDisplayFields()` — フィールド定義 → FieldDisplayDef 変換
- [ ] `buildDynamicFieldSchema()` — フィールド定義 → Zodスキーマ変換
- [ ] `buildDynamicCsvColumns()` — フィールド定義 → CSVテンプレート列変換
- [ ] `buildCsvLabelToKeyMap()` — CSVラベル → キーマッピング
- [ ] `extractCustomData()` — フォームデータ → projectCustomData 変換
- [ ] `expandCustomData()` — projectCustomData → フォームデータ展開

### フック
- [ ] `useProjectConfig()` — 動的Config生成フック

### API側対応
- [ ] `projectCustomData` のディープマージ（PATCH時に既存キーを保持）
- [ ] `projectCustomData` 内のフィールドバリデーション（businessConfig.projectFields に基づく）
- [ ] インライン編集の `projectCustomData.fieldKey` パッチ対応
