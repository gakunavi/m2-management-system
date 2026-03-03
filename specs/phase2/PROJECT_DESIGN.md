# Phase 2: 案件マスタ詳細設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [00_PROJECT_PRD.md](../00_PROJECT_PRD.md) | 全体ゴール、ユーザー種別、技術スタック |
> | [01_DATA_MODEL.md](../01_DATA_MODEL.md) | テーブル定義、命名規則 |
> | [02_COMPONENT_DESIGN.md](../02_COMPONENT_DESIGN.md) | 設定オブジェクト型定義、フック設計 |
> | [06_PHASE2_PRD.md](../06_PHASE2_PRD.md) | Phase 2 全体PRD |
> | [DYNAMIC_FIELDS_DESIGN.md](./DYNAMIC_FIELDS_DESIGN.md) | 動的フィールド設計 |

---

## 目次

1. [実装概要](#1-実装概要)
2. [Prismaスキーマ](#2-prismaスキーマ)
3. [設定オブジェクト（Config）](#3-設定オブジェクトconfig)
4. [ページ実装](#4-ページ実装)
5. [バリデーション](#5-バリデーション)
6. [案件番号自動採番](#6-案件番号自動採番)
7. [ムーブメント自動生成](#7-ムーブメント自動生成)
8. [事業セレクター連動](#8-事業セレクター連動)
9. [関連案件タブ](#9-関連案件タブ)
10. [共通コンポーネント](#10-共通コンポーネント)
11. [実装チェックリスト](#11-実装チェックリスト)

---

## 1. 実装概要

### 1.1 機能スコープ

| 機能 | 説明 |
|------|------|
| 案件一覧 | 検索・フィルター・ソート・インライン編集・ページネーション |
| 案件新規作成 | 共通項目 + 事業固有項目（動的フォーム）による登録 |
| 案件詳細 | 基本情報 + 事業固有フィールドの表示 |
| 案件編集 | 楽観的ロック付き更新 |
| 案件論理削除 | `project_is_active = false` による無効化 |
| 案件復元 | 無効化された案件の復元（管理者のみ） |
| 案件番号自動採番 | `{事業プレフィックス}-{連番}` 形式 |
| ムーブメント自動生成 | 作成時にテンプレートから pending レコード生成 |
| CSV | インポート / エクスポート |
| 一括削除 | 選択した案件の一括論理削除 |

### 1.2 関連テーブル

```
projects（案件）
├── customer → customers（顧客: 必須）
├── partner → partners（代理店: 任意）
├── business → businesses（事業: 必須）
├── assignedUser → users（担当ユーザー: 任意、アクセス制御用）
├── projectAssignedUserName（担当者名: 自由記入テキスト）
├── project_movements（ムーブメント進捗: Phase 2で自動生成、Phase 3でUI）
│   └── movement_logs（変更ログ: Phase 3）
└── project_files（添付ファイル: Phase 5）
```

---

## 2. Prismaスキーマ

### 2.1 Project モデル（新規追加）

```prisma
model Project {
  id                       Int       @id @default(autoincrement())
  businessId               Int       @map("business_id")
  customerId               Int       @map("customer_id")
  partnerId                Int?      @map("partner_id")
  projectNo                String    @unique @map("project_no") @db.VarChar(30)
  projectSalesStatus       String    @map("project_sales_status") @db.VarChar(50)
  projectExpectedCloseMonth String?  @map("project_expected_close_month") @db.VarChar(7)
  projectAssignedUserId    Int?      @map("project_assigned_user_id")
  projectAssignedUserName  String?   @map("project_assigned_user_name") @db.VarChar(100)
  projectNotes             String?   @map("project_notes") @db.Text
  projectCustomData        Json      @default("{}") @map("project_custom_data")
  projectStatusChangedAt   DateTime? @map("project_status_changed_at") @db.Timestamptz
  projectIsActive          Boolean   @default(true) @map("project_is_active")
  version                  Int       @default(1)

  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz
  createdBy  Int?     @map("created_by")
  updatedBy  Int?     @map("updated_by")

  // Relations
  business     Business  @relation(fields: [businessId], references: [id])
  customer     Customer  @relation(fields: [customerId], references: [id])
  partner      Partner?  @relation(fields: [partnerId], references: [id])
  assignedUser User?     @relation("ProjectAssignedUser", fields: [projectAssignedUserId], references: [id])
  creator      User?     @relation("ProjectCreator", fields: [createdBy], references: [id])
  updater      User?     @relation("ProjectUpdater", fields: [updatedBy], references: [id])
  movements    ProjectMovement[]

  @@index([businessId, projectSalesStatus], map: "idx_projects_business_status")
  @@index([customerId], map: "idx_projects_customer_id")
  @@index([partnerId], map: "idx_projects_partner_id")
  @@index([projectAssignedUserId], map: "idx_projects_assigned_user_id")
  @@index([projectNo], map: "idx_projects_no")
  @@index([projectStatusChangedAt(sort: Desc)], map: "idx_projects_status_changed")
  @@map("projects")
}
```

### 2.2 ProjectMovement モデル（新規追加）

```prisma
model ProjectMovement {
  id                   Int       @id @default(autoincrement())
  projectId            Int       @map("project_id")
  templateId           Int       @map("template_id")
  movementStatus       String    @default("pending") @map("movement_status") @db.VarChar(20)
  movementStartedAt    DateTime? @map("movement_started_at") @db.Timestamptz
  movementCompletedAt  DateTime? @map("movement_completed_at") @db.Timestamptz
  movementNotes        String?   @map("movement_notes") @db.Text
  movementData         Json      @default("{}") @map("movement_data")

  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz
  updatedBy Int?     @map("updated_by")

  // Relations
  project  Project          @relation(fields: [projectId], references: [id])
  template MovementTemplate @relation(fields: [templateId], references: [id])

  @@unique([projectId, templateId])
  @@index([projectId], map: "idx_project_movements_project")
  @@map("project_movements")
}
```

### 2.3 既存モデルへのリレーション追加

```prisma
// Business モデルに追加
model Business {
  // ... 既存フィールド
  projects Project[]
}

// Customer モデルに追加
model Customer {
  // ... 既存フィールド
  projects Project[]
}

// Partner モデルに追加
model Partner {
  // ... 既存フィールド
  projects Project[]
}

// MovementTemplate モデルに追加
model MovementTemplate {
  // ... 既存フィールド
  movements ProjectMovement[]
}
```

---

## 3. 設定オブジェクト（Config）

### 3.1 案件一覧 Config

```typescript
// src/config/entities/project.ts

export const projectListConfig: EntityListConfig = {
  entityType: 'project',
  apiEndpoint: '/projects',
  title: '案件一覧',
  inlineEditable: true,
  patchEndpoint: (id) => `/projects/${id}`,

  columns: [
    // --- 固定列 ---
    {
      key: 'projectNo',
      label: '案件番号',
      width: 130,
      sortable: true,
      locked: true,
    },
    {
      key: 'customerName',
      label: '顧客',
      minWidth: 180,
      sortable: true,
      locked: true,
      render: (_value, row) => {
        const name = row.customer?.customerName;
        return name ?? '-';
      },
    },
    {
      key: 'projectSalesStatus',
      label: '営業ステータス',
      width: 160,
      sortable: true,
      locked: true,
      edit: {
        type: 'select',
        // options は事業のステータス定義から動的に取得
        // → useProjectListConfig フックで注入
        optionsEndpoint: null, // 動的に設定
      },
      render: (_value, row) => {
        // ステータスラベル + カラーバッジで表示
        // → StatusBadge コンポーネントで描画
      },
    },

    // --- 共通列 ---
    {
      key: 'partnerName',
      label: '代理店',
      width: 180,
      sortable: true,
      render: (_value, row) => row.partner?.partnerName ?? '-',
    },
    {
      key: 'projectExpectedCloseMonth',
      label: '受注予定月',
      width: 130,
      sortable: true,
      edit: { type: 'month' },
    },
    {
      key: 'projectAssignedUserName',
      label: '担当者',
      width: 140,
      sortable: true,
      edit: { type: 'text' },
    },
    {
      key: 'projectNotes',
      label: '備考',
      width: 200,
      defaultVisible: false,
      edit: { type: 'textarea' },
    },
    {
      key: 'businessName',
      label: '事業',
      width: 140,
      render: (_value, row) => row.business?.businessName ?? '-',
      defaultVisible: false,
    },

    // --- 事業固有列は useProjectListConfig で動的追加 ---
  ],

  search: {
    placeholder: '案件番号・顧客名・代理店名で検索...',
    fields: ['projectNo', 'customerName', 'partnerName'],
    debounceMs: 300,
  },

  filters: [
    {
      key: 'projectSalesStatus',
      label: '営業ステータス',
      type: 'multi-select',
      // options は事業のステータス定義から動的取得
    },
    {
      key: 'projectAssignedUserName',
      label: '担当者',
      type: 'text',
    },
    {
      key: 'projectExpectedCloseMonth',
      label: '受注予定月',
      type: 'month-range',
    },
  ],

  defaultSort: { field: 'updatedAt', direction: 'desc' },

  tableSettings: {
    persistKey: 'project-list',
    defaultPageSize: 25,
    defaultDensity: 'normal',
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },

  detailPath: (id) => `/projects/${id}`,
  createPath: '/projects/new',

  batchActions: [
    {
      key: 'delete',
      label: '一括削除',
      variant: 'destructive',
      confirm: {
        title: '一括削除',
        message: (count) =>
          `選択した ${count} 件の案件を削除（無効化）しますか？`,
      },
      apiEndpoint: '/projects/batch',
      onComplete: 'refresh',
    },
  ],

  csv: {
    importEnabled: true,
    exportEnabled: true,
    endpoint: '/projects/csv',
    columnKeyMap: {
      customerId: 'customerCode',
      partnerId: 'partnerCode',
      projectAssignedUserName: 'projectAssignedUserName',
      projectSalesStatus: 'projectSalesStatusLabel',
    },
  },
};
```

### 3.2 案件詳細 Config

```typescript
export const projectDetailConfig: EntityDetailConfig = {
  entityType: 'project',
  apiEndpoint: (id) => `/projects/${id}`,
  title: (data) => data.projectNo as string,

  tabs: [
    {
      key: 'info',
      label: '基本情報',
      component: 'info',
      config: {
        sections: [
          {
            title: '基本情報',
            columns: 2,
            fields: [
              { key: 'projectNo', label: '案件番号', type: 'text' },
              {
                key: 'projectSalesStatus',
                label: '営業ステータス',
                type: 'text',
                render: (_value, data) => {
                  // StatusBadge で描画
                },
              },
              {
                key: 'customerId',
                label: '顧客',
                type: 'text',
                render: (_value, data) => {
                  const c = data.customer;
                  return c ? `${c.customerName} (${c.customerCode})` : '-';
                },
              },
              {
                key: 'partnerId',
                label: '代理店',
                type: 'text',
                render: (_value, data) => {
                  const p = data.partner;
                  return p ? `${p.partnerName} (${p.partnerCode})` : '-';
                },
              },
              {
                key: 'projectExpectedCloseMonth',
                label: '受注予定月',
                type: 'text',
              },
              { key: 'projectAssignedUserName', label: '担当者', type: 'text' },
              {
                key: 'businessId',
                label: '事業',
                type: 'text',
                render: (_value, data) => data.business?.businessName ?? '-',
              },
              { key: 'projectNotes', label: '備考', type: 'text', colSpan: 2 },
            ],
          },
          // 事業固有フィールドセクションは useProjectDetailConfig で動的追加
        ],
      },
    },
  ],

  actions: {
    edit: true,
    delete: true,
    restore: {
      activeField: 'projectIsActive',
      apiEndpoint: (id) => `/projects/${id}/restore`,
      requiredRole: ['admin'],
    },
  },
};
```

### 3.3 案件フォーム Config

```typescript
export const projectFormConfig: EntityFormConfig = {
  entityType: 'project',
  apiEndpoint: '/projects',
  title: { create: '案件新規登録', edit: '案件編集' },

  sections: [
    {
      title: '基本情報',
      columns: 2,
      fields: [
        {
          key: 'businessId',
          label: '事業',
          type: 'select',
          required: true,
          disabled: false, // 新規時のみ変更可
          disabledOnEdit: true,
          // options は事業一覧から動的取得
        },
        {
          key: 'customerId',
          label: '顧客',
          type: 'entity-select',
          required: true,
          entitySelect: {
            endpoint: '/customers',
            labelField: 'customerName',
            codeField: 'customerCode',
            searchPlaceholder: '顧客名・顧客コードで検索...',
          },
        },
        {
          key: 'partnerId',
          label: '代理店',
          type: 'entity-select',
          entitySelect: {
            endpoint: '/partners',
            labelField: 'partnerName',
            codeField: 'partnerCode',
            searchPlaceholder: '代理店名・代理店コードで検索...',
          },
        },
        {
          key: 'projectSalesStatus',
          label: '営業ステータス',
          type: 'select',
          required: true,
          // options は事業のステータス定義から動的取得
        },
        {
          key: 'projectExpectedCloseMonth',
          label: '受注予定月',
          type: 'month',
        },
        {
          key: 'projectAssignedUserName',
          label: '担当者',
          type: 'text',
          placeholder: '担当者名を入力',
        },
        {
          key: 'projectAssignedUserId',
          label: '担当ユーザー（アクセス制御用）',
          type: 'select',
          // options はユーザーマスタから動的取得
        },
        {
          key: 'projectNotes',
          label: '備考',
          type: 'textarea',
          colSpan: 2,
        },
      ],
    },
    // 事業固有フィールドセクションは useProjectFormConfig で動的追加
  ],

  validationSchema: projectBaseSchema, // → セクション5参照
  redirectAfterSave: (id) => `/projects/${id}`,
  warnOnLeave: true,
};
```

### 3.4 動的Config生成フック

案件は事業によってフィールドが異なるため、Configを動的に生成するフックを用意する。

```typescript
// src/hooks/use-project-config.ts

/**
 * 事業のフィールド定義からConfigを動的に拡張するフック。
 * 一覧・詳細・フォームの3つのConfigを返す。
 *
 * @param businessId - 対象事業ID（事業セレクターの値）
 * @returns { listConfig, detailConfig, formConfig, isLoading }
 */
export function useProjectConfig(businessId: number | null) {
  // 1. 事業の businessConfig.projectFields を取得
  // 2. 営業ステータス定義を取得
  // 3. ベースConfigに動的列・フィールド・バリデーションを追加して返す
}
```

**重要な設計方針:**
- ベースConfig（`projectListConfig` 等）はファイルで静的に定義
- 事業固有の部分はフックで動的にマージ
- Config自体は不変オブジェクト（`useMemo` でメモ化）

---

## 4. ページ実装

### 4.1 ディレクトリ構成

```
src/app/(auth)/projects/
├── page.tsx               # 一覧ページ（Server Component）
├── _client.tsx            # 一覧クライアントコンポーネント
├── new/
│   └── page.tsx           # 新規作成ページ
├── [id]/
│   ├── page.tsx           # 詳細ページ
│   ├── _client.tsx        # 詳細クライアントコンポーネント
│   └── edit/
│       └── page.tsx       # 編集ページ
```

### 4.2 一覧ページの特殊処理

案件一覧は事業セレクターの値に連動するため、通常のEntityListTemplateに加えて以下の処理が必要:

```typescript
// src/app/(auth)/projects/_client.tsx

export function ProjectListClient() {
  const { selectedBusinessId } = useBusinessScope();

  // 動的Configの生成
  const { listConfig, isLoading } = useProjectConfig(selectedBusinessId);

  if (isLoading) return <LoadingSpinner />;

  return (
    <EntityListTemplate
      config={listConfig}
      // businessId をAPIクエリに追加
      additionalParams={{ businessId: selectedBusinessId }}
    />
  );
}
```

### 4.3 フォームページの特殊処理

```typescript
// src/app/(auth)/projects/new/page.tsx

export default async function ProjectNewPage() {
  return <ProjectFormClient mode="create" />;
}

// _form-client.tsx
export function ProjectFormClient({ mode, id }: Props) {
  const { selectedBusinessId } = useBusinessScope();
  const { formConfig, isLoading } = useProjectConfig(selectedBusinessId);

  if (isLoading) return <LoadingSpinner />;

  return (
    <EntityFormTemplate
      config={formConfig}
      id={id}
      breadcrumbs={[
        { label: '案件一覧', href: '/projects' },
        { label: mode === 'create' ? '新規登録' : '編集' },
      ]}
    />
  );
}
```

---

## 5. バリデーション

### 5.1 共通項目バリデーション（静的）

```typescript
// src/lib/validations/project.ts

export const projectBaseSchema = z.object({
  businessId: z.number().int().positive('事業を選択してください'),
  customerId: z.number().int().positive('顧客を選択してください'),
  partnerId: z.number().int().positive().optional().nullable(),
  projectSalesStatus: z.string().min(1, '営業ステータスを選択してください'),
  projectExpectedCloseMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM形式で入力してください')
    .optional()
    .nullable()
    .or(z.literal('')),
  projectAssignedUserId: z.number().int().positive().optional().nullable(),
  projectAssignedUserName: z.string().max(100, '担当者名は100文字以内で入力してください').optional().nullable().or(z.literal('')),
  projectNotes: z.string().max(2000, '備考は2000文字以内で入力してください').optional().nullable().or(z.literal('')),
});
```

### 5.2 事業固有フィールドバリデーション（動的）

`businessConfig.projectFields` の定義から動的にZodスキーマを生成する。

```typescript
// src/lib/validations/dynamic-fields.ts

/**
 * フィールド定義配列からZodスキーマを動的に生成する。
 * projectBaseSchema とマージして使用する。
 *
 * @param fields - businessConfig.projectFields の配列
 * @returns z.ZodObject - 事業固有フィールドの検証スキーマ
 */
export function buildDynamicFieldSchema(
  fields: ProjectFieldDefinition[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case 'text':
        schema = z.string().max(500);
        break;
      case 'textarea':
        schema = z.string().max(2000);
        break;
      case 'number':
        schema = z.number();
        break;
      case 'date':
        schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
        break;
      case 'month':
        schema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
        break;
      case 'select':
        schema = z.string();
        break;
      case 'checkbox':
        schema = z.boolean();
        break;
      default:
        schema = z.unknown();
    }

    if (!field.required) {
      schema = schema.optional().nullable();
    }

    shape[field.key] = schema;
  }

  return z.object(shape);
}
```

### 5.3 API側バリデーション

- 共通項目: `projectBaseSchema` で検証
- 事業固有項目: APIルート内で `businessConfig.projectFields` を取得 → `buildDynamicFieldSchema` で検証
- `projectSalesStatus` の値が事業のステータス定義に存在するかを検証

---

## 6. 案件番号自動採番

### 6.1 採番ロジック

```typescript
// src/lib/project-helpers.ts

/**
 * 案件番号を生成する。
 * 形式: {事業プレフィックス}-{4桁連番}
 * 例: MG-0001, SA-0023
 *
 * @param prisma - PrismaClient
 * @param businessId - 事業ID
 * @returns 生成された案件番号
 */
export async function generateProjectNo(
  prisma: PrismaClient,
  businessId: number
): Promise<string> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { businessProjectPrefix: true },
  });

  const prefix = business.businessProjectPrefix;

  const latest = await prisma.project.findFirst({
    where: { businessId },
    orderBy: { projectNo: 'desc' },
    select: { projectNo: true },
  });

  let nextNum = 1;
  if (latest?.projectNo) {
    const match = latest.projectNo.match(/-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}
```

### 6.2 注意事項

- 採番は `$transaction` 内で実行し、同時作成での重複を防止
- `projectNo` カラムに UNIQUE 制約があるため、万一重複した場合はDBエラーでロールバック
- 顧客コード・代理店コードと同じ採番パターン（最新コード +1）

---

## 7. ムーブメント自動生成

### 7.1 概要

案件作成時、その事業のアクティブなムーブメントテンプレート全件に対して `pending` 状態のレコードを自動生成する。

### 7.2 実装

```typescript
// src/lib/project-helpers.ts

/**
 * 案件作成時にムーブメントレコードを自動生成する。
 * 案件作成APIの $transaction 内で呼び出す。
 *
 * @param tx - Prisma Transaction Client
 * @param projectId - 作成された案件ID
 * @param businessId - 事業ID
 */
export async function createInitialMovements(
  tx: PrismaTransactionClient,
  projectId: number,
  businessId: number
): Promise<void> {
  const templates = await tx.movementTemplate.findMany({
    where: { businessId, stepIsActive: true },
    orderBy: { stepNumber: 'asc' },
    select: { id: true },
  });

  if (templates.length === 0) return;

  await tx.projectMovement.createMany({
    data: templates.map((t) => ({
      projectId,
      templateId: t.id,
      movementStatus: 'pending',
    })),
  });
}
```

### 7.3 注意事項

- ムーブメントの操作（status変更、ロールバック等）はPhase 3で実装
- Phase 2ではレコードが存在するだけで、UIからは見えない
- 案件削除時にムーブメントは連鎖削除しない（論理削除のため）

---

## 8. 事業セレクター連動

### 8.1 グローバルstate

```typescript
// src/stores/business-scope.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BusinessScopeState {
  selectedBusinessId: number | null; // null = 「すべて」
  setSelectedBusinessId: (id: number | null) => void;
}

export const useBusinessScope = create<BusinessScopeState>()(
  persist(
    (set) => ({
      selectedBusinessId: null,
      setSelectedBusinessId: (id) => set({ selectedBusinessId: id }),
    }),
    { name: 'business-scope' }
  )
);
```

### 8.2 ヘッダーセレクターの改修

既存の事業セレクター（表示のみ）を、Zustand storeに接続して実際のデータフィルタリングに使う。

### 8.3 API側の対応

案件一覧API `/api/v1/projects` に `businessId` クエリパラメータを追加:
- `businessId` 指定あり → その事業の案件のみ返却
- `businessId` 未指定 → ユーザーの権限に応じた全事業の案件を返却

---

## 9. 関連案件タブ

### 9.1 顧客詳細への追加

```typescript
// customerDetailConfig.tabs に追加
{
  key: 'projects',
  label: '関連案件',
  component: 'related',
  config: {
    apiEndpoint: (parentId) => `/customers/${parentId}/projects`,
    columns: [
      { key: 'projectNo', label: '案件番号', width: 130 },
      { key: 'businessName', label: '事業', width: 140 },
      { key: 'projectSalesStatus', label: 'ステータス', width: 140 },
      { key: 'projectExpectedCloseMonth', label: '受注予定月', width: 120 },
      { key: 'projectAssignedUserName', label: '担当者', width: 140 },
    ],
    detailPath: (id) => `/projects/${id}`,
    showCount: true,
  },
}
```

### 9.2 代理店詳細への追加

同様の `RelatedTabConfig` で代理店の案件タブを追加。
API: `/api/v1/partners/{partnerId}/projects`

---

## 10. 共通コンポーネント

### 10.1 EntitySelectField（検索付きエンティティ選択）

顧客・代理店・ユーザー等、エンティティを検索して選択するフォームフィールド。

```typescript
// src/components/form/entity-select-field.tsx

interface EntitySelectFieldProps {
  value: number | null;
  onChange: (id: number | null) => void;
  endpoint: string;          // API検索エンドポイント
  labelField: string;        // 表示名フィールド
  codeField?: string;        // コードフィールド（表示用）
  searchPlaceholder?: string;
  error?: string;
  disabled?: boolean;
}
```

**設計方針:**
- 入力欄にテキストを打つと API に検索リクエスト（debounce 300ms）
- 検索結果をドロップダウンリストで表示
- 選択すると ID をセット、表示はラベル（コード付き）
- クリアボタンで NULL にリセット
- **他のエンティティ（将来の案件×担当者等）にも再利用可能**

### 10.2 MonthPicker

月単位の入力UI。

```typescript
// src/components/ui/month-picker.tsx

interface MonthPickerProps {
  value: string | null;      // "YYYY-MM" 形式
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}
```

**設計方針:**
- `<input type="month">` を使用（ブラウザネイティブ）
- フォームフィールド型 `'month'` に対応
- インライン編集の `CellEditorType: 'month'` にも対応

### 10.3 SortableItemList

ドラッグ＆ドロップ対応のCRUDリスト。事業詳細の3つの管理タブで共用する。
→ 詳細は [BUSINESS_TABS_DESIGN.md](./BUSINESS_TABS_DESIGN.md) を参照

### 10.4 StatusBadge

営業ステータスをカラーバッジで表示するコンポーネント。

```typescript
// src/components/ui/status-badge.tsx

interface StatusBadgeProps {
  label: string;
  color: string;   // hex カラーコード
}
```

---

## 11. 実装チェックリスト

### Prismaスキーマ
- [ ] `Project` モデル追加
- [ ] `ProjectMovement` モデル追加
- [ ] 既存モデル（Business, Customer, Partner, MovementTemplate）にリレーション追加
- [ ] マイグレーション実行
- [ ] シードデータ更新（サンプル案件）

### API
- [ ] `GET /api/v1/projects` — 一覧（businessId フィルター対応）
- [ ] `GET /api/v1/projects/:id` — 詳細
- [ ] `POST /api/v1/projects` — 作成（採番 + ムーブメント自動生成）
- [ ] `PATCH /api/v1/projects/:id` — 更新（楽観的ロック）
- [ ] `DELETE /api/v1/projects/:id` — 論理削除
- [ ] `PATCH /api/v1/projects/:id/restore` — 復元
- [ ] `POST /api/v1/projects/batch` — 一括削除
- [ ] `GET /api/v1/projects/csv` — エクスポート
- [ ] `POST /api/v1/projects/csv` — インポート
- [ ] `GET /api/v1/customers/:id/projects` — 顧客の関連案件
- [ ] `GET /api/v1/partners/:id/projects` — 代理店の関連案件

### Config
- [ ] `projectListConfig` 作成
- [ ] `projectDetailConfig` 作成
- [ ] `projectFormConfig` 作成
- [ ] `useProjectConfig` フック作成（動的Config生成）

### ページ
- [ ] `/projects` — 一覧ページ
- [ ] `/projects/new` — 新規作成ページ
- [ ] `/projects/:id` — 詳細ページ
- [ ] `/projects/:id/edit` — 編集ページ
- [ ] ナビゲーションに「案件管理」メニュー追加

### 共通コンポーネント
- [ ] `EntitySelectField` — 検索付きエンティティ選択
- [ ] `MonthPicker` — 月選択UI
- [ ] `StatusBadge` — ステータスバッジ
- [ ] `BusinessScopeProvider` — 事業セレクター連動

### バリデーション
- [ ] `projectBaseSchema` 作成
- [ ] `buildDynamicFieldSchema` 作成
- [ ] API側バリデーション実装

### 既存画面への追加
- [ ] 顧客詳細に「関連案件」タブ追加
- [ ] 代理店詳細に「関連案件」タブ追加
- [ ] 事業セレクターのデータ連動実装
