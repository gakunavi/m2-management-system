# Phase 2: 事業詳細タブ設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [06_PHASE2_PRD.md](../06_PHASE2_PRD.md) | Phase 2 全体PRD |
> | [phase1/BUSINESS_DESIGN.md](../phase1/BUSINESS_DESIGN.md) | Phase 1 事業定義設計（元仕様） |
> | [DYNAMIC_FIELDS_DESIGN.md](./DYNAMIC_FIELDS_DESIGN.md) | 動的フィールド設計 |

---

## 目次

1. [概要](#1-概要)
2. [共通コンポーネント: SortableItemList](#2-共通コンポーネント-sortableitemlist)
3. [営業ステータス定義タブ](#3-営業ステータス定義タブ)
4. [ムーブメントテンプレートタブ](#4-ムーブメントテンプレートタブ)
5. [案件フィールド定義タブ](#5-案件フィールド定義タブ)
6. [API仕様](#6-api仕様)
7. [事業詳細Configの更新](#7-事業詳細configの更新)
8. [実装チェックリスト](#8-実装チェックリスト)

---

## 1. 概要

事業詳細画面に以下の3つのCRUD管理タブを追加する。
3タブとも「並び替え可能なアイテムリスト + モーダルフォーム」という同一パターンのため、
**`SortableItemList`** 共通コンポーネントを作成し、各タブで再利用する。

| タブ | 管理対象 | DBテーブル/フィールド |
|------|---------|---------------------|
| 営業ステータス定義 | 事業の営業ステータス | `business_status_definitions` |
| ムーブメントテンプレート | 事業のムーブメントステップ | `movement_templates` |
| 案件フィールド定義 | 事業固有の案件フィールド | `businesses.business_config` の `projectFields` |

---

## 2. 共通コンポーネント: SortableItemList

### 2.1 概要

ドラッグ＆ドロップで並び替え可能なアイテムリスト。
追加・編集・削除のCRUD操作をモーダルフォームで行う。
営業ステータス定義・ムーブメントテンプレート・案件フィールド定義の3つのタブで共用する。

### 2.2 Props 設計

```typescript
// src/components/shared/sortable-item-list.tsx

interface SortableItemListProps<T extends { id: string | number }> {
  /** アイテム一覧 */
  items: T[];
  /** ローディング状態 */
  isLoading: boolean;

  /** テーブルの列定義 */
  columns: SortableItemColumn<T>[];

  /** 追加ボタンのラベル */
  addLabel: string;

  /** モーダルフォームのフィールド定義 */
  formFields: SortableItemFormField[];
  /** モーダルタイトル */
  formTitle: { create: string; edit: string };

  /** CRUD コールバック */
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string | number, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string | number) => Promise<void>;
  onReorder: (orderedIds: (string | number)[]) => Promise<void>;

  /** 編集時に無効化するフィールドキー（例: コード系） */
  disabledOnEditKeys?: string[];
  /** 削除確認メッセージ */
  deleteConfirmMessage?: (item: T) => string;
}

interface SortableItemColumn<T> {
  key: string;
  label: string;
  width?: number;
  render?: (value: unknown, item: T) => React.ReactNode;
}

interface SortableItemFormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'color' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  description?: string;
}
```

### 2.3 内部構造

```
SortableItemList
├── ヘッダー
│   └── 「+ {addLabel}」ボタン
├── テーブル
│   ├── ドラッグハンドル（⠿ アイコン）
│   ├── 各列の表示
│   └── アクション列（編集・削除アイコン）
├── 追加/編集モーダル
│   ├── フォームフィールド群（formFields に基づく）
│   └── 保存/キャンセルボタン
└── 削除確認ダイアログ
```

### 2.4 ドラッグ＆ドロップ

- `@dnd-kit/core` + `@dnd-kit/sortable` を使用
- ドロップ完了時に `onReorder` コールバックを呼び出し
- `onReorder` は並び替え後のID配列を受け取り、APIで表示順を一括更新

### 2.5 再利用性

このコンポーネントは Phase 2 の3タブだけでなく、将来的に以下でも再利用可能:
- ファイルカテゴリ定義（Phase 5）
- 通知テンプレート管理
- カスタムフィルター定義

---

## 3. 営業ステータス定義タブ

### 3.1 テーブル列

| 列 | キー | 幅 | 説明 |
|----|------|----|------|
| 表示順 | - | 40 | ドラッグハンドル |
| コード | `statusCode` | 120 | 作成後は編集不可 |
| ラベル | `statusLabel` | 180 | |
| 優先度 | `statusPriority` | 80 | 数値表示 |
| 色 | `statusColor` | 60 | カラーチップ表示 |
| 最終 | `statusIsFinal` | 60 | チェックマーク |
| 失注 | `statusIsLost` | 60 | チェックマーク |
| 有効 | `statusIsActive` | 60 | チェックマーク |

### 3.2 フォームフィールド

| フィールド | 型 | 必須 | 備考 |
|-----------|-----|------|------|
| ステータスコード | text | ○ | 英数字+アンダースコア。作成後は編集不可 |
| 表示ラベル | text | ○ | |
| 優先度 | number | ○ | 0以上の整数。大きいほど高い |
| 表示色 | color | - | カラーピッカー |
| 最終ステータス | checkbox | - | |
| 失注ステータス | checkbox | - | |
| 有効 | checkbox | - | デフォルト: true |

### 3.3 ビジネスルール

- `statusCode` は事業内で一意。作成後は変更不可（`disabledOnEditKeys: ['statusCode']`）
- `statusIsFinal = true` は事業内で1つのみ → API側で `$transaction` 内に排他制御
- `statusIsLost = true` は事業内で1つのみ → 同上
- 新規追加時、`statusSortOrder` は既存の最大値 +1 を自動設定

### 3.4 データフック

```typescript
// src/hooks/use-status-definitions.ts

export function useStatusDefinitions(businessId: number) {
  // GET: /api/v1/businesses/{businessId}/status-definitions
  // CREATE: POST /api/v1/businesses/{businessId}/status-definitions
  // UPDATE: PATCH /api/v1/businesses/{businessId}/status-definitions/{id}
  // DELETE: DELETE /api/v1/businesses/{businessId}/status-definitions/{id}
  // REORDER: PATCH /api/v1/businesses/{businessId}/status-definitions/reorder
}
```

---

## 4. ムーブメントテンプレートタブ

### 4.1 テーブル列

| 列 | キー | 幅 | 説明 |
|----|------|----|------|
| 表示順 | - | 40 | ドラッグハンドル |
| No. | `stepNumber` | 50 | 自動採番 |
| コード | `stepCode` | 140 | 作成後は編集不可 |
| ステップ名 | `stepName` | 200 | |
| ステータス連動 | `stepIsSalesLinked` | 80 | チェックマーク |
| 連動先 | `stepLinkedStatusCode` | 140 | ステータスコード表示 |
| 有効 | `stepIsActive` | 60 | チェックマーク |

### 4.2 フォームフィールド

| フィールド | 型 | 必須 | 備考 |
|-----------|-----|------|------|
| ステップコード | text | ○ | 英数字+アンダースコア。作成後は編集不可 |
| ステップ名 | text | ○ | |
| 説明 | textarea | - | |
| 営業ステータス連動 | checkbox | - | |
| 連動ステータスコード | select | - | 連動=true の場合のみ表示。同事業のステータス定義から選択 |
| 有効 | checkbox | - | デフォルト: true |

### 4.3 ビジネスルール

- `stepCode` は事業内で一意。作成後は変更不可
- `stepNumber` はドラッグ＆ドロップ時に自動再計算（1始まりの連番）
- `stepLinkedStatusCode` は `stepIsSalesLinked = true` の場合のみ入力可能
  - 選択肢は同事業の `BusinessStatusDefinition.statusCode` から取得
- 既存案件のムーブメントには影響しない（テンプレート変更は新規案件から適用）

### 4.4 データフック

```typescript
// src/hooks/use-movement-templates.ts

export function useMovementTemplates(businessId: number) {
  // GET: /api/v1/businesses/{businessId}/movement-templates
  // CREATE: POST /api/v1/businesses/{businessId}/movement-templates
  // UPDATE: PATCH /api/v1/businesses/{businessId}/movement-templates/{id}
  // DELETE: DELETE /api/v1/businesses/{businessId}/movement-templates/{id}
  // REORDER: PATCH /api/v1/businesses/{businessId}/movement-templates/reorder
}
```

---

## 5. 案件フィールド定義タブ

### 5.1 概要

事業固有の案件フィールドを管理する。
他の2タブと異なり、データは独立テーブルではなく `businesses.business_config` の `projectFields` 配列に格納する。

### 5.2 テーブル列

| 列 | キー | 幅 | 説明 |
|----|------|----|------|
| 表示順 | - | 40 | ドラッグハンドル |
| キー | `key` | 140 | フィールドキー。作成後は編集不可 |
| ラベル | `label` | 180 | |
| 型 | `type` | 100 | text / number / select 等 |
| 必須 | `required` | 60 | チェックマーク |

### 5.3 フォームフィールド

| フィールド | 型 | 必須 | 備考 |
|-----------|-----|------|------|
| フィールドキー | text | ○ | 英数字+アンダースコア。`project_custom_data` のJSONキー。作成後は編集不可 |
| 表示ラベル | text | ○ | |
| 型 | select | ○ | text / textarea / number / date / month / select / checkbox |
| 選択肢 | text（複数行） | - | 型=select の場合のみ表示。改行区切りで入力 |
| 必須 | checkbox | - | |
| 説明 | text | - | プレースホルダーや入力ヒント |

### 5.4 データ構造

```typescript
// businessConfig.projectFields の型定義

interface ProjectFieldDefinition {
  key: string;           // JSONキー（例: "project_amount"）
  label: string;         // 表示ラベル（例: "案件金額"）
  type: 'text' | 'textarea' | 'number' | 'date' | 'month' | 'select' | 'checkbox';
  options?: string[];    // select型の場合の選択肢
  required?: boolean;    // 必須フラグ
  description?: string;  // 入力ヒント
  sortOrder: number;     // 表示順
}
```

### 5.5 保存方式

- フィールド定義の変更は `businesses.business_config` の `projectFields` を丸ごと更新
- API: `PATCH /api/v1/businesses/{businessId}` で `businessConfig` を更新（楽観的ロック）
- フロントエンドでは `projectFields` 配列を操作し、保存時に `businessConfig` 全体をPATCH

### 5.6 ビジネスルール

- `key` はフィールド定義内で一意。作成後は変更不可（既存案件のデータキーが壊れるため）
- フィールド削除時: 既存案件の `project_custom_data` からは削除しない（データ保全）。一覧・フォームから非表示になるだけ
- `type` の変更は既存データとの互換性に注意（number→text は安全、text→number は危険）→ 型変更は作成後は不可とする

### 5.7 データフック

```typescript
// src/hooks/use-project-field-definitions.ts

export function useProjectFieldDefinitions(businessId: number) {
  // GET: 事業詳細APIの businessConfig.projectFields から取得
  // SAVE: PATCH /api/v1/businesses/{businessId} で businessConfig を更新
  //
  // ※ 他の2タブ（独立テーブル）とは異なり、個別CRUD APIではなく
  //    businessConfig の配列操作 + 事業PATCH で更新する
}
```

---

## 6. API仕様

### 6.1 営業ステータス定義 API

| メソッド | エンドポイント | 説明 |
|---------|-------------|------|
| GET | `/api/v1/businesses/{businessId}/status-definitions` | 一覧取得（sortOrder順） |
| POST | `/api/v1/businesses/{businessId}/status-definitions` | 新規追加 |
| PATCH | `/api/v1/businesses/{businessId}/status-definitions/{id}` | 更新 |
| DELETE | `/api/v1/businesses/{businessId}/status-definitions/{id}` | 削除 |
| PATCH | `/api/v1/businesses/{businessId}/status-definitions/reorder` | 並び替え |

**POST リクエスト例:**
```json
{
  "statusCode": "payment_confirmed",
  "statusLabel": "2.入金確定",
  "statusPriority": 5,
  "statusColor": "#3b82f6",
  "statusIsFinal": false,
  "statusIsLost": false
}
```

**PATCH reorder リクエスト例:**
```json
{
  "orderedIds": [3, 1, 5, 2, 4, 7, 6]
}
```

### 6.2 ムーブメントテンプレート API

| メソッド | エンドポイント | 説明 |
|---------|-------------|------|
| GET | `/api/v1/businesses/{businessId}/movement-templates` | 一覧取得（stepNumber順） |
| POST | `/api/v1/businesses/{businessId}/movement-templates` | 新規追加 |
| PATCH | `/api/v1/businesses/{businessId}/movement-templates/{id}` | 更新 |
| DELETE | `/api/v1/businesses/{businessId}/movement-templates/{id}` | 削除 |
| PATCH | `/api/v1/businesses/{businessId}/movement-templates/reorder` | 並び替え（stepNumber再計算） |

**POST リクエスト例:**
```json
{
  "stepCode": "delivery_prep",
  "stepName": "納品準備",
  "stepDescription": "納品先の設置場所確認と準備",
  "stepIsSalesLinked": false,
  "stepLinkedStatusCode": null
}
```

### 6.3 案件フィールド定義 API

独立APIではなく、事業更新APIの一部として扱う。

| メソッド | エンドポイント | 説明 |
|---------|-------------|------|
| PATCH | `/api/v1/businesses/{businessId}` | `businessConfig.projectFields` を含むbusinessConfigの更新 |

**PATCH リクエスト例（projectFields のみ更新）:**
```json
{
  "businessConfig": {
    "projectFields": [
      {
        "key": "project_amount",
        "label": "案件金額",
        "type": "number",
        "required": true,
        "sortOrder": 1
      },
      {
        "key": "project_name",
        "label": "案件名",
        "type": "text",
        "required": false,
        "sortOrder": 2
      }
    ]
  },
  "version": 3
}
```

**注意:** `businessConfig` の更新時は、既存の他のキー（`revenueRecognition`, `settings` 等）を保持するため、API側でディープマージを行う。

---

## 7. 事業詳細Configの更新

### 7.1 タブ追加

```typescript
// src/config/entities/business.ts の businessDetailConfig.tabs に追加

{
  key: 'statusDefinitions',
  label: '営業ステータス定義',
  component: 'custom',
  config: {},
},
{
  key: 'movementTemplates',
  label: 'ムーブメントテンプレート',
  component: 'custom',
  config: {},
},
{
  key: 'projectFields',
  label: '案件フィールド定義',
  component: 'custom',
  config: {},
},
```

### 7.2 カスタムタブの接続

```typescript
// src/app/(auth)/businesses/[id]/_client.tsx

import { StatusDefinitionsTab } from '@/components/features/business/status-definitions-tab';
import { MovementTemplatesTab } from '@/components/features/business/movement-templates-tab';
import { ProjectFieldsTab } from '@/components/features/business/project-fields-tab';

export function BusinessDetailClient({ id }: Props) {
  return (
    <EntityDetailTemplate
      config={businessDetailConfig}
      id={id}
      customTabs={{
        statusDefinitions: StatusDefinitionsTab,
        movementTemplates: MovementTemplatesTab,
        projectFields: ProjectFieldsTab,
      }}
      breadcrumbs={[
        { label: '事業マスタ一覧', href: '/businesses' },
        { label: '事業詳細' },
      ]}
    />
  );
}
```

### 7.3 各タブコンポーネントの構造

各タブは `SortableItemList` を内部で使用し、データフックで API と接続する。

```typescript
// src/components/features/business/status-definitions-tab.tsx

export function StatusDefinitionsTab({ entityId }: { entityId: number }) {
  const {
    items, isLoading,
    create, update, remove, reorder,
  } = useStatusDefinitions(entityId);

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
      deleteConfirmMessage={(item) =>
        `ステータス「${item.statusLabel}」を削除しますか？`
      }
    />
  );
}
```

---

## 8. 実装チェックリスト

### 共通コンポーネント
- [ ] `SortableItemList` コンポーネント作成
- [ ] `ColorPicker` コンポーネント作成（ステータス色用）
- [ ] `@dnd-kit/core` + `@dnd-kit/sortable` パッケージ追加

### 営業ステータス定義
- [ ] API: GET / POST / PATCH / DELETE / reorder
- [ ] `useStatusDefinitions` フック作成
- [ ] `StatusDefinitionsTab` コンポーネント作成
- [ ] `statusIsFinal` / `statusIsLost` の排他制御（API側）

### ムーブメントテンプレート
- [ ] API: GET / POST / PATCH / DELETE / reorder
- [ ] `useMovementTemplates` フック作成
- [ ] `MovementTemplatesTab` コンポーネント作成
- [ ] `stepNumber` 自動再計算ロジック

### 案件フィールド定義
- [ ] `useProjectFieldDefinitions` フック作成
- [ ] `ProjectFieldsTab` コンポーネント作成
- [ ] `businessConfig` ディープマージロジック（API側）
- [ ] フィールド定義のバリデーション

### 事業詳細画面
- [ ] `businessDetailConfig` にタブ3つ追加
- [ ] `_client.tsx` に `customTabs` 接続
