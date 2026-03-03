# Phase 1: 事業定義管理 詳細設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [00_PROJECT_PRD.md](../00_PROJECT_PRD.md) | 全体ゴール、ユーザー種別、技術スタック |
> | [01_DATA_MODEL.md](../01_DATA_MODEL.md) | テーブル定義、命名規則 |
> | [02_COMPONENT_DESIGN.md](../02_COMPONENT_DESIGN.md) | 設定オブジェクト型定義、フック設計 |
> | [05_PHASE0_DETAILED_DESIGN.md](../05_PHASE0_DETAILED_DESIGN.md) | Phase 0基盤実装の詳細 |

---

## 目次

1. [実装概要](#1-実装概要)
2. [Prismaスキーマ](#2-prismaスキーマ)
3. [シードデータ](#3-シードデータ)
4. [設定オブジェクト](#4-設定オブジェクト)
5. [ページ実装](#5-ページ実装)
6. [バリデーション](#6-バリデーション)
7. [営業ステータス定義管理](#7-営業ステータス定義管理)
8. [ムーブメントテンプレート管理](#8-ムーブメントテンプレート管理)
9. [ビジネスロジック](#9-ビジネスロジック)
10. [実装チェックリスト](#10-実装チェックリスト)

---

## 1. 実装概要

### 1.1 機能スコープ

| 機能 | 説明 |
|------|------|
| 事業一覧 | 検索・ソート付き一覧表示 |
| 事業詳細 | タブ付き詳細画面（基本情報・営業ステータス定義・ムーブメントテンプレート・事業固有設定） |
| 事業編集 | 楽観的ロック付き更新（新規作成は管理者のみ） |
| 事業無効化 | `business_is_active = false` による無効化（論理削除ではなく業務停止対応） |
| 事業有効化 | 無効化された事業の有効化復元 |
| 営業ステータス定義CRUD | 事業詳細画面のタブ内で営業ステータスの追加・編集・削除・並び替え |
| ムーブメントテンプレートCRUD | 事業詳細画面のタブ内でムーブメントステップの追加・編集・削除・並び替え |
| 事業固有設定編集 | `business_config`のJSONエディタまたは構造化フォーム |

### 1.2 関連テーブル

```
businesses（事業定義）※ Phase 0で作成済み
├── business_status_definitions（営業ステータス定義）※ Phase 1で追加
├── movement_templates（ムーブメントテンプレート）※ Phase 1で追加
├── projects（案件）※ Phase 2で実装、Phase 1では関連タブにプレースホルダー表示
├── customer_business_links（顧客×事業リンク）
└── user_business_assignments（ユーザー×事業割当）
```

### 1.3 ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/
│   │   └── businesses/
│   │       ├── page.tsx                 # 事業一覧
│   │       └── [id]/
│   │           ├── page.tsx             # 事業詳細
│   │           └── edit/
│   │               └── page.tsx         # 事業編集
│   └── api/v1/
│       └── businesses/
│           ├── route.ts                 # GET(一覧) ※Phase 0で作成済み、検索・ソート拡張
│           └── [id]/
│               ├── route.ts             # GET(詳細), PATCH(更新)
│               ├── toggle-active/
│               │   └── route.ts         # PATCH(有効/無効切り替え)
│               ├── status-definitions/
│               │   ├── route.ts         # GET(一覧), POST(作成)
│               │   ├── [statusId]/
│               │   │   └── route.ts     # PATCH(更新), DELETE(削除)
│               │   └── reorder/
│               │       └── route.ts     # PATCH(並び替え)
│               ├── movement-templates/
│               │   ├── route.ts         # GET(一覧), POST(作成)
│               │   ├── [templateId]/
│               │   │   └── route.ts     # PATCH(更新), DELETE(削除)
│               │   └── reorder/
│               │       └── route.ts     # PATCH(並び替え)
│               └── config/
│                   └── route.ts         # GET(取得), PATCH(更新)
├── config/
│   └── entities/
│       └── business.ts                  # 事業設定オブジェクト
└── lib/
    └── validations/
        └── business.ts                  # 事業バリデーションスキーマ
```

### 1.4 性能要件

| 操作 | 95パーセンタイル目標 | データ量前提 |
|---|---|---|
| 事業一覧取得 | 300ms以下 | 20事業 |
| 事業詳細取得（ステータス+ムーブメント含む） | 500ms以下 | ステータス20件 + ムーブメント30件 |
| ステータス定義CRUD | 200ms以下 | - |
| ムーブメントテンプレート並び替え | 300ms以下 | 30件 |
| business_config更新 | 200ms以下 | JSON 10KB以下 |

---

## 2. Prismaスキーマ

### 2.1 Business モデル（Phase 0で作成済み、Phase 1でリレーション追加）

```prisma
model Business {
  id                    Int      @id @default(autoincrement())
  businessCode          String   @unique @map("business_code") @db.VarChar(20)
  businessName          String   @map("business_name") @db.VarChar(100)
  businessDescription   String?  @map("business_description") @db.Text
  businessConfig        Json     @default("{}") @map("business_config")
  businessProjectPrefix String   @unique @map("business_project_prefix") @db.VarChar(10)
  businessIsActive      Boolean  @default(true) @map("business_is_active")
  businessSortOrder     Int      @default(0) @map("business_sort_order")
  version               Int      @default(1)

  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt             DateTime @updatedAt @map("updated_at") @db.Timestamptz
  createdBy             Int?     @map("created_by")
  updatedBy             Int?     @map("updated_by")

  // リレーション（Phase 0）
  userAssignments       UserBusinessAssignment[]

  // リレーション（Phase 1で追加）
  statusDefinitions     BusinessStatusDefinition[]
  movementTemplates     MovementTemplate[]
  customerContacts      CustomerContact[]
  customerBusinessLinks CustomerBusinessLink[]

  // リレーション（Phase 2以降）
  projects              Project[]

  creator               User?    @relation("BusinessCreator", fields: [createdBy], references: [id])
  updater               User?    @relation("BusinessUpdater", fields: [updatedBy], references: [id])

  @@index([businessIsActive, businessSortOrder])
  @@map("businesses")
}
```

### 2.2 BusinessStatusDefinition モデル

```prisma
model BusinessStatusDefinition {
  id              Int      @id @default(autoincrement())
  businessId      Int      @map("business_id")
  statusCode      String   @map("status_code") @db.VarChar(50)
  statusLabel     String   @map("status_label") @db.VarChar(100)
  statusPriority  Int      @map("status_priority")
  statusColor     String?  @map("status_color") @db.VarChar(20)
  statusIsFinal   Boolean  @default(false) @map("status_is_final")
  statusIsLost    Boolean  @default(false) @map("status_is_lost")
  statusSortOrder Int      @default(0) @map("status_sort_order")
  statusIsActive  Boolean  @default(true) @map("status_is_active")

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // リレーション
  business        Business @relation(fields: [businessId], references: [id])

  @@unique([businessId, statusCode])
  @@index([businessId, statusSortOrder])
  @@map("business_status_definitions")
}
```

### 2.3 MovementTemplate モデル

```prisma
model MovementTemplate {
  id                  Int      @id @default(autoincrement())
  businessId          Int      @map("business_id")
  stepNumber          Int      @map("step_number")
  stepCode            String   @map("step_code") @db.VarChar(50)
  stepName            String   @map("step_name") @db.VarChar(100)
  stepDescription     String?  @map("step_description") @db.Text
  stepIsSalesLinked   Boolean  @default(false) @map("step_is_sales_linked")
  stepLinkedStatusCode String? @map("step_linked_status_code") @db.VarChar(50)
  stepConfig          Json     @default("{}") @map("step_config")
  stepIsActive        Boolean  @default(true) @map("step_is_active")

  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // リレーション
  business            Business @relation(fields: [businessId], references: [id])

  @@unique([businessId, stepNumber])
  @@index([businessId, stepNumber])
  @@map("movement_templates")
}
```

### 2.4 推奨インデックス設計

```prisma
model Business {
  @@index([businessCode, businessIsActive], map: "idx_businesses_code_active")
  @@index([businessSortOrder], map: "idx_businesses_sort_order")
  @@map("businesses")
}

model BusinessStatusDefinition {
  @@index([businessId, statusSortOrder], map: "idx_business_statuses_sort")
  @@index([businessId, statusIsFinal], map: "idx_business_statuses_final")
  @@index([businessId, statusIsLost], map: "idx_business_statuses_lost")
  @@map("business_status_definitions")
}

model MovementTemplate {
  @@index([businessId, stepSortOrder], map: "idx_movement_templates_sort")
  @@map("movement_templates")
}
```

---

## 3. シードデータ

### 3.1 営業ステータス定義（MOAG事業）

```typescript
const moagStatusDefinitions = [
  {
    businessId: 1, // MOAG事業
    statusCode: "purchased",
    statusLabel: "1.購入済み",
    statusPriority: 6,
    statusColor: "#22c55e", // green
    statusIsFinal: true,
    statusIsLost: false,
    statusSortOrder: 0,
  },
  {
    businessId: 1,
    statusCode: "payment_confirmed",
    statusLabel: "2.入金確定",
    statusPriority: 5,
    statusColor: "#3b82f6", // blue
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 1,
  },
  {
    businessId: 1,
    statusCode: "contracting",
    statusLabel: "3.契約締結中",
    statusPriority: 4,
    statusColor: "#8b5cf6", // purple
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 2,
  },
  {
    businessId: 1,
    statusCode: "a_yomi",
    statusLabel: "4.Aヨミ(申請中)",
    statusPriority: 3,
    statusColor: "#f59e0b", // amber
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 3,
  },
  {
    businessId: 1,
    statusCode: "b_yomi",
    statusLabel: "5.Bヨミ",
    statusPriority: 2,
    statusColor: "#f97316", // orange
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 4,
  },
  {
    businessId: 1,
    statusCode: "appointing",
    statusLabel: "6.アポ中",
    statusPriority: 1,
    statusColor: "#6b7280", // gray
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 5,
  },
  {
    businessId: 1,
    statusCode: "lost",
    statusLabel: "7.失注",
    statusPriority: 0,
    statusColor: "#ef4444", // red
    statusIsFinal: false,
    statusIsLost: true,
    statusSortOrder: 6,
  },
];
```

### 3.2 営業ステータス定義（サービスA事業）

```typescript
const serviceAStatusDefinitions = [
  {
    businessId: 2, // サービスA事業
    statusCode: "contracted",
    statusLabel: "1.契約済み",
    statusPriority: 4,
    statusColor: "#22c55e",
    statusIsFinal: true,
    statusIsLost: false,
    statusSortOrder: 0,
  },
  {
    businessId: 2,
    statusCode: "proposal",
    statusLabel: "2.提案中",
    statusPriority: 3,
    statusColor: "#3b82f6",
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 1,
  },
  {
    businessId: 2,
    statusCode: "negotiating",
    statusLabel: "3.商談中",
    statusPriority: 2,
    statusColor: "#f59e0b",
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 2,
  },
  {
    businessId: 2,
    statusCode: "approaching",
    statusLabel: "4.アプローチ中",
    statusPriority: 1,
    statusColor: "#6b7280",
    statusIsFinal: false,
    statusIsLost: false,
    statusSortOrder: 3,
  },
  {
    businessId: 2,
    statusCode: "lost",
    statusLabel: "5.失注",
    statusPriority: 0,
    statusColor: "#ef4444",
    statusIsFinal: false,
    statusIsLost: true,
    statusSortOrder: 4,
  },
];
```

### 3.3 ムーブメントテンプレート（MOAG事業）

```typescript
const moagMovementTemplates = [
  {
    businessId: 1,
    stepNumber: 1,
    stepCode: "sales_status",
    stepName: "営業ステータス",
    stepDescription: "営業ステータスの管理。ステータス変更時に自動連動。",
    stepIsSalesLinked: true,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 2,
    stepCode: "location_share",
    stepName: "設置場所共有",
    stepDescription: "設置場所情報の顧客との共有",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 3,
    stepCode: "movable_contract",
    stepName: "動産契約",
    stepDescription: "動産売買契約の締結",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 4,
    stepCode: "industrial_application",
    stepName: "工業会申請",
    stepDescription: "工業会への証明書申請",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 5,
    stepCode: "industrial_approval",
    stepName: "工業会承認",
    stepDescription: "工業会からの証明書承認",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 6,
    stepCode: "sme_application",
    stepName: "中企庁申請",
    stepDescription: "中小企業庁への補助金申請",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 7,
    stepCode: "sme_approval",
    stepName: "中企庁承認",
    stepDescription: "中小企業庁からの補助金承認",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 8,
    stepCode: "contract_creation",
    stepName: "契約書作成",
    stepDescription: "契約書の作成・ドラフト",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 9,
    stepCode: "legal_check",
    stepName: "法務チェック",
    stepDescription: "法務部門による契約書レビュー",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 10,
    stepCode: "contract_execution",
    stepName: "契約締結",
    stepDescription: "契約書の締結完了",
    stepIsSalesLinked: true,
    stepLinkedStatusCode: "contracting",
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 11,
    stepCode: "invoice_issue",
    stepName: "請求書発行",
    stepDescription: "請求書の発行",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 12,
    stepCode: "payment_confirm",
    stepName: "入金確認",
    stepDescription: "入金の確認完了",
    stepIsSalesLinked: true,
    stepLinkedStatusCode: "payment_confirmed",
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 13,
    stepCode: "delivery_prep",
    stepName: "納品準備",
    stepDescription: "納品に向けた準備作業",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 14,
    stepCode: "delivery_exec",
    stepName: "納品実行",
    stepDescription: "納品の実行",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 15,
    stepCode: "installation_report",
    stepName: "設置報告",
    stepDescription: "設置完了の報告",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 16,
    stepCode: "extended_care",
    stepName: "拡張ケア契約",
    stepDescription: "拡張ケア（保守）契約の締結",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 17,
    stepCode: "receipt_issue",
    stepName: "領収書発行",
    stepDescription: "領収書の発行",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 1,
    stepNumber: 18,
    stepCode: "completed",
    stepName: "完了",
    stepDescription: "全工程完了",
    stepIsSalesLinked: true,
    stepLinkedStatusCode: "purchased",
    stepConfig: {},
  },
];
```

### 3.4 ムーブメントテンプレート（サービスA事業）

```typescript
const serviceAMovementTemplates = [
  {
    businessId: 2,
    stepNumber: 1,
    stepCode: "sales_status",
    stepName: "営業ステータス",
    stepDescription: "営業ステータスの管理",
    stepIsSalesLinked: true,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 2,
    stepNumber: 2,
    stepCode: "proposal",
    stepName: "提案書作成",
    stepDescription: "提案書の作成・提出",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 2,
    stepNumber: 3,
    stepCode: "contract",
    stepName: "契約締結",
    stepDescription: "サービス契約の締結",
    stepIsSalesLinked: true,
    stepLinkedStatusCode: "contracted",
    stepConfig: {},
  },
  {
    businessId: 2,
    stepNumber: 4,
    stepCode: "setup",
    stepName: "セットアップ",
    stepDescription: "サービスのセットアップ・導入",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
  {
    businessId: 2,
    stepNumber: 5,
    stepCode: "delivery",
    stepName: "納品・稼働開始",
    stepDescription: "サービスの納品と稼働開始",
    stepIsSalesLinked: false,
    stepLinkedStatusCode: null,
    stepConfig: {},
  },
];
```

---

## 4. 設定オブジェクト

### 4.1 事業一覧設定（businessListConfig）

```typescript
// config/entities/business.ts
import { EntityListConfig } from "@/types/config";

export const businessListConfig: EntityListConfig = {
  entityType: "business",
  apiEndpoint: "/api/v1/businesses",
  title: "事業一覧",

  columns: [
    {
      key: "businessCode",
      label: "事業コード",
      width: 120,
      sortable: true,
      locked: true,
    },
    {
      key: "businessName",
      label: "事業名",
      width: 200,
      sortable: true,
      locked: true,
    },
    {
      key: "businessProjectPrefix",
      label: "案件プレフィックス",
      width: 130,
    },
    {
      key: "businessDescription",
      label: "事業説明",
      width: 250,
    },
    {
      key: "statusDefinitionCount",
      label: "ステータス数",
      width: 100,
      align: "right",
    },
    {
      key: "movementTemplateCount",
      label: "ステップ数",
      width: 100,
      align: "right",
    },
    {
      key: "businessIsActive",
      label: "状態",
      width: 80,
      render: (value) => `<StatusBadge status={value ? "有効" : "無効"} />`,
    },
    {
      key: "businessSortOrder",
      label: "表示順",
      width: 80,
      align: "right",
      sortable: true,
    },
    {
      key: "updatedAt",
      label: "更新日",
      width: 100,
      sortable: true,
      render: (value) => `formatDate(value)`,
      defaultVisible: false,
    },
  ],

  search: {
    placeholder: "事業名、事業コードで検索",
    fields: ["businessName", "businessCode"],
    debounceMs: 300,
  },

  filters: [
    {
      key: "businessIsActive",
      label: "状態",
      type: "select",
      options: [
        { value: "true", label: "有効" },
        { value: "false", label: "無効" },
      ],
    },
  ],

  defaultSort: { field: "businessSortOrder", direction: "asc" },

  tableSettings: {
    persistKey: "business_list",
    defaultPageSize: 25,
    defaultDensity: "normal",
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },

  detailPath: (id) => `/businesses/${id}`,
  // 新規作成は管理者のみ（UIボタンの表示制御はロールで判定）
  createPath: undefined,

  csv: {
    importEnabled: false,
    exportEnabled: false,
  },

  batchActions: [],
};
```

### 4.2 事業詳細設定（businessDetailConfig）

```typescript
import { EntityDetailConfig } from "@/types/config";

export const businessDetailConfig: EntityDetailConfig = {
  entityType: "business",
  apiEndpoint: "/api/v1/businesses",
  title: "事業詳細",

  editPath: (id) => `/businesses/${id}/edit`,
  listPath: "/businesses",

  tabs: [
    {
      key: "info",
      label: "基本情報",
      component: "info",
      config: {
        sections: [
          {
            title: "基本情報",
            columns: 2,
            fields: [
              { key: "businessCode", label: "事業コード" },
              { key: "businessName", label: "事業名" },
              { key: "businessProjectPrefix", label: "案件番号プレフィックス" },
              { key: "businessSortOrder", label: "表示順", format: "number" },
              { key: "businessDescription", label: "事業説明", colSpan: 2 },
            ],
          },
          {
            title: "状態",
            columns: 2,
            fields: [
              { key: "businessIsActive", label: "有効/無効", format: "badge" },
              { key: "updatedAt", label: "最終更新日", format: "datetime" },
            ],
          },
        ],
      } as InfoTabConfig,
    },
    {
      key: "statusDefinitions",
      label: "営業ステータス定義",
      component: "custom",
      // BusinessStatusDefinitionsTab コンポーネントを使用（後述）
    },
    {
      key: "movementTemplates",
      label: "ムーブメントテンプレート",
      component: "custom",
      // BusinessMovementTemplatesTab コンポーネントを使用（後述）
    },
    {
      key: "businessConfig",
      label: "事業固有設定",
      component: "custom",
      // BusinessConfigTab コンポーネントを使用（後述）
    },
    {
      key: "projects",
      label: "関連案件",
      component: "related",
      config: {
        apiEndpoint: "/api/v1/projects",
        filterKey: "businessId",
        columns: [
          { key: "projectNo", label: "案件番号", width: 120 },
          { key: "projectName", label: "案件名", width: 200 },
          { key: "projectSalesStatus", label: "ステータス", width: 100 },
          { key: "projectAmount", label: "金額", width: 100, align: "right" },
        ],
        emptyMessage: "この事業に紐づく案件はありません",
        detailPath: (id) => `/projects/${id}`,
      } as RelatedTabConfig,
    },
  ],

  deleteConfig: {
    confirm: {
      title: "事業の無効化",
      message:
        "この事業を無効化しますか？無効化すると事業一覧で非表示になりますが、既存の案件やデータは保持されます。",
    },
    apiEndpoint: "/api/v1/businesses",
  },
};
```

### 4.3 事業フォーム設定（businessFormConfig）

```typescript
import { EntityFormConfig } from "@/types/config";
import { businessUpdateSchema } from "@/lib/validations/business";

export const businessFormConfig: EntityFormConfig = {
  entityType: "business",
  apiEndpoint: "/api/v1/businesses",
  title: { create: "事業新規登録", edit: "事業編集" },
  redirectAfterSave: (id) => `/businesses/${id}`,

  sections: [
    {
      title: "基本情報",
      columns: 2,
      fields: [
        {
          key: "businessCode",
          label: "事業コード",
          type: "text",
          required: true,
          placeholder: "例: moag",
          disabled: true, // 編集時は変更不可
          helpText: "事業コードは作成後に変更できません",
        },
        {
          key: "businessName",
          label: "事業名",
          type: "text",
          required: true,
          placeholder: "例: MOAG事業",
        },
        {
          key: "businessProjectPrefix",
          label: "案件番号プレフィックス",
          type: "text",
          required: true,
          placeholder: "例: MG",
          disabled: true, // 編集時は変更不可
          helpText: "案件番号の先頭に付加される文字列（作成後に変更不可）",
        },
        {
          key: "businessSortOrder",
          label: "表示順",
          type: "number",
          placeholder: "例: 0",
        },
        {
          key: "businessDescription",
          label: "事業説明",
          type: "textarea",
          colSpan: 2,
          placeholder: "事業の概要を入力",
        },
      ],
    },
  ],

  validationSchema: {
    edit: businessUpdateSchema,
  },
};
```

---

## 5. ページ実装

### 5.1 事業一覧ページ

```typescript
// src/app/(auth)/businesses/page.tsx
import { EntityListTemplate } from "@/components/templates/entity-list-template";
import { businessListConfig } from "@/config/entities/business";

export default function BusinessListPage() {
  return <EntityListTemplate config={businessListConfig} />;
}
```

### 5.2 事業詳細ページ

```typescript
// src/app/(auth)/businesses/[id]/page.tsx
import { EntityDetailTemplate } from "@/components/templates/entity-detail-template";
import { businessDetailConfig } from "@/config/entities/business";
import { BusinessStatusDefinitionsTab } from "@/components/features/business/business-status-definitions-tab";
import { BusinessMovementTemplatesTab } from "@/components/features/business/business-movement-templates-tab";
import { BusinessConfigTab } from "@/components/features/business/business-config-tab";

export default function BusinessDetailPage({ params }: { params: { id: string } }) {
  const customTabs = {
    statusDefinitions: BusinessStatusDefinitionsTab,
    movementTemplates: BusinessMovementTemplatesTab,
    businessConfig: BusinessConfigTab,
  };

  return (
    <EntityDetailTemplate
      config={businessDetailConfig}
      id={params.id}
      customTabs={customTabs}
    />
  );
}
```

### 5.3 事業編集ページ

```typescript
// src/app/(auth)/businesses/[id]/edit/page.tsx
import { EntityFormTemplate } from "@/components/templates/entity-form-template";
import { businessFormConfig } from "@/config/entities/business";

export default function BusinessEditPage({ params }: { params: { id: string } }) {
  return <EntityFormTemplate config={businessFormConfig} id={params.id} />;
}
```

---

## 6. バリデーション

### 6.1 Zodスキーマ

```typescript
// src/lib/validations/business.ts
import { z } from "zod";

// 事業更新スキーマ（Phase 1では編集のみ、新規作成は管理者がDB直接操作またはAdmin API）
export const businessUpdateSchema = z.object({
  businessName: z
    .string()
    .min(1, "事業名は必須です")
    .max(100, "事業名は100文字以内で入力してください"),
  businessDescription: z.string().optional().or(z.literal("")),
  businessSortOrder: z
    .number()
    .int("整数で入力してください")
    .min(0, "0以上の値を入力してください")
    .default(0),
  version: z.number().int("バージョンが不正です"),
});

// 営業ステータス定義スキーマ
export const statusDefinitionCreateSchema = z.object({
  statusCode: z
    .string()
    .min(1, "ステータスコードは必須です")
    .max(50, "ステータスコードは50文字以内で入力してください")
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "ステータスコードは英小文字で始まり、英小文字・数字・アンダースコアのみ使用可能です"
    ),
  statusLabel: z
    .string()
    .min(1, "表示ラベルは必須です")
    .max(100, "表示ラベルは100文字以内で入力してください"),
  statusPriority: z
    .number()
    .int("整数で入力してください")
    .min(0, "0以上の値を入力してください"),
  statusColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "カラーコードの形式が正しくありません（例: #22c55e）")
    .optional()
    .or(z.literal("")),
  statusIsFinal: z.boolean().default(false),
  statusIsLost: z.boolean().default(false),
  statusSortOrder: z.number().int().min(0).default(0),
});

export const statusDefinitionUpdateSchema = statusDefinitionCreateSchema.partial().extend({
  statusCode: z.string().optional(), // コードは更新時に変更不可（読み取り専用で送信）
});

// ムーブメントテンプレートスキーマ
export const movementTemplateCreateSchema = z.object({
  stepNumber: z
    .number()
    .int("整数で入力してください")
    .min(1, "1以上の値を入力してください"),
  stepCode: z
    .string()
    .min(1, "ステップコードは必須です")
    .max(50, "ステップコードは50文字以内で入力してください")
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "ステップコードは英小文字で始まり、英小文字・数字・アンダースコアのみ使用可能です"
    ),
  stepName: z
    .string()
    .min(1, "ステップ名は必須です")
    .max(100, "ステップ名は100文字以内で入力してください"),
  stepDescription: z.string().optional().or(z.literal("")),
  stepIsSalesLinked: z.boolean().default(false),
  stepLinkedStatusCode: z
    .string()
    .max(50)
    .optional()
    .nullable(),
  stepConfig: z.record(z.unknown()).default({}),
});

export const movementTemplateUpdateSchema = movementTemplateCreateSchema.partial().extend({
  stepCode: z.string().optional(), // コードは更新時に変更不可
});

// 事業固有設定スキーマ（厳格なバリデーション）
export const businessConfigSchema = z.object({
  projectFields: z.record(z.object({
    label: z.string().min(1).max(100),
    type: z.enum(["text", "number", "select", "date", "textarea"]),
    required: z.boolean().optional().default(false),
    options: z.array(z.string()).optional(), // type='select'の場合のみ
    placeholder: z.string().optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })).optional(),
  movementConfig: z.object({
    enableAutoStatusSync: z.boolean().optional().default(false),
    enableDragDrop: z.boolean().optional().default(true),
  }).optional(),
  displayConfig: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logoUrl: z.string().url().optional(),
  }).optional(),
}).strict(); // .passthrough() → .strict() に変更

// 並び替えスキーマ
export const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      sortOrder: z.number().int().min(0),
    })
  ),
});

// 型エクスポート
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
export type StatusDefinitionCreateInput = z.infer<typeof statusDefinitionCreateSchema>;
export type StatusDefinitionUpdateInput = z.infer<typeof statusDefinitionUpdateSchema>;
export type MovementTemplateCreateInput = z.infer<typeof movementTemplateCreateSchema>;
export type MovementTemplateUpdateInput = z.infer<typeof movementTemplateUpdateSchema>;
export type BusinessConfigInput = z.infer<typeof businessConfigSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
```

> **注意**: `business_config`は`.strict()`バリデーションを適用し、未定義フィールドを拒否する。
> 新しいフィールドを追加する場合は、必ずスキーマ定義を更新すること。
> `type='select'`のフィールドには`options`が必須であることをカスタムバリデーション（`.refine()`）で検証する。

---

## 7. 営業ステータス定義管理

### 7.1 UI仕様

事業詳細画面の「営業ステータス定義」タブにインラインでCRUD機能を提供する。

**表示:**
- テーブル形式でステータス定義一覧を表示
- 列: 表示順 / ステータスコード / 表示ラベル / 優先度 / 表示色（カラーチップ） / 最終ステータス / 失注ステータス / 有効/無効
- ドラッグ&ドロップによる表示順変更をサポート

**操作:**
- 「ステータスを追加」ボタン → モーダルフォームを表示
- 行の編集アイコン → モーダルフォームで編集
- 行の削除アイコン → 確認ダイアログ後に物理削除
- ドラッグハンドル → 表示順の並び替え（一括保存）

**制約:**
- `statusCode` は事業内で一意。作成後は変更不可（フォーム上で読み取り専用表示）
- `statusIsFinal` は事業内で1つだけ `true`（API層で自動排他制御。詳細は7.2参照）
- `statusIsLost` は事業内で1つだけ `true`（API層で自動排他制御。詳細は7.2参照）
- 案件から参照されているステータスは削除不可（Phase 2以降で案件実装後に制約追加）

### 7.2 営業ステータスの排他制御

`statusIsFinal`と`statusIsLost`はそれぞれ**事業内で1つのみtrue**とする。UI警告ではなく、API層で自動的に排他制御を行う。

**API動作仕様**:

1. **statusIsFinal=true で作成/更新する場合**:
   - 同一事業内の既存ステータスで`statusIsFinal=true`のレコードを自動的に`false`に更新
   - トランザクション内で実行し、データ整合性を保証

2. **statusIsLost=true で作成/更新する場合**:
   - 同一事業内の既存ステータスで`statusIsLost=true`のレコードを自動的に`false`に更新
   - トランザクション内で実行し、データ整合性を保証

3. **同時にstatusIsFinal=trueとstatusIsLost=trueの設定は不可**:
   - バリデーションエラー（400）を返却
   - エラーメッセージ: 「最終ステータスと失注ステータスを同時に設定することはできません」

**実装例**:
```typescript
// APIハンドラー内
await prisma.$transaction(async (tx) => {
  if (data.statusIsFinal) {
    await tx.businessStatus.updateMany({
      where: { businessId, statusIsFinal: true, id: { not: statusId } },
      data: { statusIsFinal: false },
    });
  }
  if (data.statusIsLost) {
    await tx.businessStatus.updateMany({
      where: { businessId, statusIsLost: true, id: { not: statusId } },
      data: { statusIsLost: false },
    });
  }
  return tx.businessStatus.update({ where: { id: statusId }, data });
});
```

**確認チェック項目**:
- [ ] ステータスAをstatusIsFinal=trueに設定 → 成功
- [ ] ステータスBをstatusIsFinal=trueに設定 → 成功 & ステータスAのstatusIsFinalがfalseに変更
- [ ] ステータスXをstatusIsFinal=trueかつstatusIsLost=trueに設定 → 400エラー

### 7.3 コンポーネント

```typescript
// src/components/features/business/business-status-definitions-tab.tsx
"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { StatusDefinitionFormModal } from "./status-definition-form-modal";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Props = {
  entityId: number;
};

export function BusinessStatusDefinitionsTab({ entityId }: Props) {
  // ステータス定義一覧取得
  // モーダル表示制御（追加/編集）
  // CRUD操作
  // ドラッグ&ドロップによる並び替え
  // statusIsFinal / statusIsLost の重複警告
}
```

```typescript
// src/components/features/business/status-definition-form-modal.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal } from "@/components/ui/modal";
import { statusDefinitionCreateSchema } from "@/lib/validations/business";

type Props = {
  businessId: number;
  statusDefinition?: BusinessStatusDefinition; // 編集時に渡す
  onClose: () => void;
  onSave: () => void;
};

export function StatusDefinitionFormModal({ businessId, statusDefinition, onClose, onSave }: Props) {
  // フォーム（statusCode, statusLabel, statusPriority, statusColor, statusIsFinal, statusIsLost）
  // statusCode は編集時に disabled
  // statusColor はカラーピッカーまたはテキスト入力
  // statusIsFinal / statusIsLost のチェックボックス
}
```

---

## 8. ムーブメントテンプレート管理

### 8.1 UI仕様

事業詳細画面の「ムーブメントテンプレート」タブにインラインでCRUD機能を提供する。

**表示:**
- テーブル形式でムーブメントステップ一覧を表示（stepNumber昇順）
- 列: ステップ番号 / ステップコード / ステップ名 / 説明 / 営業ステータス連動 / 連動先ステータス / 有効/無効
- ドラッグ&ドロップによるステップ番号の並び替えをサポート

**操作:**
- 「ステップを追加」ボタン → モーダルフォームを表示
- 行の編集アイコン → モーダルフォームで編集
- 行の削除アイコン → 確認ダイアログ後に物理削除
- ドラッグハンドル → ステップ番号の並び替え（stepNumberを自動再採番して一括保存）

**制約:**
- `stepNumber` は事業内で一意。並び替え時に自動再採番される
- `stepCode` は作成後に変更不可
- `stepIsSalesLinked = true` の場合、`stepLinkedStatusCode` にその事業の営業ステータスコードをドロップダウンで選択可能にする
- `stepLinkedStatusCode` は同事業の `business_status_definitions.status_code` から選択する

### 8.2 コンポーネント

```typescript
// src/components/features/business/business-movement-templates-tab.tsx
"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { MovementTemplateFormModal } from "./movement-template-form-modal";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Props = {
  entityId: number;
};

export function BusinessMovementTemplatesTab({ entityId }: Props) {
  // ムーブメントテンプレート一覧取得
  // モーダル表示制御（追加/編集）
  // CRUD操作
  // ドラッグ&ドロップによる並び替え（stepNumber再採番）
}
```

```typescript
// src/components/features/business/movement-template-form-modal.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal } from "@/components/ui/modal";
import { movementTemplateCreateSchema } from "@/lib/validations/business";

type Props = {
  businessId: number;
  movementTemplate?: MovementTemplate; // 編集時に渡す
  statusDefinitions: BusinessStatusDefinition[]; // 連動先ステータスの選択肢
  onClose: () => void;
  onSave: () => void;
};

export function MovementTemplateFormModal({
  businessId,
  movementTemplate,
  statusDefinitions,
  onClose,
  onSave,
}: Props) {
  // フォーム（stepNumber, stepCode, stepName, stepDescription, stepIsSalesLinked, stepLinkedStatusCode）
  // stepCode は編集時に disabled
  // stepIsSalesLinked のチェックボックス → true の場合に stepLinkedStatusCode のドロップダウンを表示
  // stepLinkedStatusCode は statusDefinitions から動的に選択肢を生成
}
```

### 8.3 事業固有設定タブ

```typescript
// src/components/features/business/business-config-tab.tsx
"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Props = {
  entityId: number;
};

export function BusinessConfigTab({ entityId }: Props) {
  // business_config の取得・表示・編集
  // 2つのモード切り替え:
  //   1. 構造化フォームモード: projectFields, customerFields, partnerFields, settings を個別セクションで編集
  //   2. JSONエディタモード: business_config 全体をJSONテキストエリアで直接編集
  // バリデーション: JSON構文チェック + businessConfigSchema による構造チェック
  // 保存: PATCH /api/v1/businesses/:id/config
}
```

---

## 9. ビジネスロジック

### 9.1 楽観的ロック

Phase 0で実装済みのPrisma middlewareを利用する。事業更新時のフローは以下の通り:

```
1. クライアント → PATCH /api/v1/businesses/:id { ...data, version: 1 }
2. サーバー → Prisma middleware が version チェック
3. version 一致 → 更新実行、version を 2 にインクリメント
4. version 不一致 → 409 Conflict レスポンス
5. クライアント → ConflictErrorModal 表示 → 「最新データを読み込む」or「編集を続ける」
```

### 9.2 事業の無効化/有効化

```
PATCH /api/v1/businesses/:id/toggle-active
→ business_is_active を反転
→ 200 OK レスポンス（更新後のデータ）

無効化時の影響:
- BusinessSwitcher のドロップダウンから非表示になる
- 事業一覧ではフィルターで「無効」を選択すると表示可能
- 既存の案件データ、営業ステータス定義、ムーブメントテンプレートは保持される
- 無効化された事業に紐づく案件の新規作成は不可（Phase 2で制御）
```

### 9.3 営業ステータス定義の並び替え

```
PATCH /api/v1/businesses/:id/status-definitions/reorder
Body: { items: [{ id: 3, sortOrder: 0 }, { id: 1, sortOrder: 1 }, { id: 2, sortOrder: 2 }] }
→ トランザクション内で全ステータスの statusSortOrder を一括更新
→ 200 OK レスポンス（更新後の一覧データ）
```

### 9.4 ムーブメントテンプレートの並び替え

```
PATCH /api/v1/businesses/:id/movement-templates/reorder
Body: { items: [{ id: 5, sortOrder: 1 }, { id: 3, sortOrder: 2 }, { id: 1, sortOrder: 3 }] }
→ トランザクション内で全テンプレートの stepNumber を一括再採番
→ 200 OK レスポンス（更新後の一覧データ）
```

### 9.5 ステータス連動バリデーション

ムーブメントテンプレートの `stepLinkedStatusCode` が設定されている場合、参照先の営業ステータス定義が存在するかをサーバー側で検証する。

```
POST/PATCH /api/v1/businesses/:id/movement-templates/...
→ stepIsSalesLinked = true かつ stepLinkedStatusCode が指定された場合
→ business_status_definitions テーブルで (businessId, statusCode) の存在チェック
→ 存在しない場合は 400 VALIDATION_ERROR: "指定されたステータスコードが存在しません"
```

### 9.6 監査ログ

Phase 0で実装済みのPrisma middlewareにより、businesses、business_status_definitions、movement_templates テーブルの INSERT/UPDATE/DELETE を自動記録する。

記録対象フィールド: 全フィールド（version, created_at, updated_at を除く）

---

## 10. 実装チェックリスト

### Step 1: Prismaスキーマ拡張

**対象ファイル**: `prisma/schema.prisma`, `prisma/seed.ts`

**作業内容**:
1. BusinessStatusDefinition, MovementTemplate モデルを追加
2. Business モデルにリレーション（statusDefinitions, movementTemplates）を追加
3. Business モデルに `version` カラムを追加（楽観的ロック対応）
4. マイグレーション実行
5. シードデータ追加（MOAG事業: ステータス7件 + テンプレート18件、サービスA事業: ステータス5件 + テンプレート5件）

**確認チェック**:
- [ ] `npx prisma migrate dev --name add_business_status_and_movement` → マイグレーション成功
- [ ] `npx prisma db seed` → シードデータ投入成功
- [ ] `npx prisma studio` → business_status_definitions テーブル: 12件（MOAG 7件 + サービスA 5件）
- [ ] `npx prisma studio` → movement_templates テーブル: 23件（MOAG 18件 + サービスA 5件）
- [ ] `npm run type-check` → エラーゼロ

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 2: API実装

**対象ファイル**: `src/app/api/v1/businesses/` 配下

**作業内容**:
1. 事業一覧API拡張（GET /api/v1/businesses） — 検索・フィルター・ステータス数/テンプレート数集計を追加
2. 事業詳細API（GET /api/v1/businesses/:id） — リレーション含む詳細取得
3. 事業更新API（PATCH /api/v1/businesses/:id） — 楽観的ロック
4. 事業有効/無効切り替えAPI（PATCH /api/v1/businesses/:id/toggle-active）
5. 営業ステータス定義 CRUD API（GET/POST/PATCH/DELETE）
6. 営業ステータス定義 並び替えAPI（PATCH reorder）
7. ムーブメントテンプレート CRUD API（GET/POST/PATCH/DELETE）
8. ムーブメントテンプレート 並び替えAPI（PATCH reorder）
9. 事業固有設定 取得・更新API（GET/PATCH config）

**確認チェック**:
- [ ] `GET /api/v1/businesses` → 2件のデータが返却される（ステータス数・テンプレート数付き）
- [ ] `GET /api/v1/businesses?search=MOAG` → 1件にフィルタリングされる
- [ ] `GET /api/v1/businesses/1` → MOAG事業の詳細データが返却される
- [ ] `PATCH /api/v1/businesses/1` → version一致で更新成功
- [ ] `PATCH /api/v1/businesses/1` → version不一致で409 CONFLICT
- [ ] `PATCH /api/v1/businesses/1/toggle-active` → business_is_active が反転する
- [ ] `GET /api/v1/businesses/1/status-definitions` → 7件のステータス定義が返却される
- [ ] `POST /api/v1/businesses/1/status-definitions` → ステータス定義が追加される
- [ ] `POST /api/v1/businesses/1/status-definitions` → statusCode重複時に400エラー
- [ ] `PATCH /api/v1/businesses/1/status-definitions/reorder` → 並び替えが反映される
- [ ] `GET /api/v1/businesses/1/movement-templates` → 18件のテンプレートが返却される
- [ ] `POST /api/v1/businesses/1/movement-templates` → テンプレートが追加される
- [ ] `POST /api/v1/businesses/1/movement-templates` → stepNumber重複時に400エラー
- [ ] `PATCH /api/v1/businesses/1/movement-templates/reorder` → 並び替え（stepNumber再採番）が反映される
- [ ] `GET /api/v1/businesses/1/config` → business_config が返却される
- [ ] `PATCH /api/v1/businesses/1/config` → business_config が更新される
- [ ] `npm run type-check` → エラーゼロ

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 3: 設定オブジェクト + バリデーション

**対象ファイル**: `src/config/entities/business.ts`, `src/lib/validations/business.ts`

**作業内容**:
1. businessListConfig, businessDetailConfig, businessFormConfig の作成
2. Zodバリデーションスキーマの作成（business, statusDefinition, movementTemplate, businessConfig, reorder）

**確認チェック**:
- [ ] `npm run type-check` → エラーゼロ
- [ ] business.ts に EntityListConfig, EntityDetailConfig, EntityFormConfig 型の設定が存在する
- [ ] バリデーションスキーマが全てエクスポートされている

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 4: ページ実装

**対象ファイル**: `src/app/(auth)/businesses/` 配下

**作業内容**:
1. 一覧ページ（EntityListTemplateに設定を渡すだけ）
2. 詳細ページ（EntityDetailTemplate + カスタムタブ3つ）
3. 編集ページ（EntityFormTemplateに設定+IDを渡すだけ）
4. サイドバーナビゲーションに「事業管理」リンクを追加（管理者のみ表示）

**確認チェック**:
- [ ] サイドバーの「事業管理」をクリック → 事業一覧が表示される（2件）
- [ ] 「事業管理」リンクはadminロールのユーザーのみに表示される
- [ ] テーブルの「事業コード」ヘッダーをクリック → ソート切り替え
- [ ] 検索欄に「MOAG」と入力 → 1件にフィルタリング
- [ ] 事業名をクリック → 事業詳細画面に遷移
- [ ] 詳細画面で基本情報タブにデータが表示される
- [ ] 「編集」ボタン → 編集フォームに現在の値がプリセットされている
- [ ] businessCode, businessProjectPrefix は編集フォームで disabled（変更不可）
- [ ] 編集して「保存」→ 更新されて詳細画面に戻る
- [ ] 「無効化」ボタン → 確認ダイアログ → business_is_active が false に切り替わる
- [ ] `npm run type-check` → エラーゼロ
- [ ] `npm run build` → ビルド成功

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 5: 営業ステータス定義カスタムタブ

**対象ファイル**: `src/components/features/business/` 配下

**作業内容**:
1. BusinessStatusDefinitionsTab コンポーネント
2. StatusDefinitionFormModal コンポーネント

**確認チェック**:
- [ ] 「営業ステータス定義」タブ → MOAG事業で7件のステータスが表示される
- [ ] 「ステータスを追加」→ モーダルフォーム表示
- [ ] ステータスを追加 → 一覧に追加表示される
- [ ] 既存のステータスコードで追加 → バリデーションエラー表示
- [ ] ステータスの編集 → モーダルで編集、statusCodeはdisabled
- [ ] ステータスの削除 → 確認後に削除
- [ ] ドラッグ&ドロップで並び替え → 保存後に表示順が反映
- [ ] statusIsFinal を2つ以上 true にした場合 → UIで警告表示
- [ ] `npm run type-check` → エラーゼロ

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 6: ムーブメントテンプレートカスタムタブ

**対象ファイル**: `src/components/features/business/` 配下

**作業内容**:
1. BusinessMovementTemplatesTab コンポーネント
2. MovementTemplateFormModal コンポーネント

**確認チェック**:
- [ ] 「ムーブメントテンプレート」タブ → MOAG事業で18件のステップが表示される
- [ ] 「ステップを追加」→ モーダルフォーム表示
- [ ] ステップを追加 → 一覧に追加表示される
- [ ] stepIsSalesLinked をチェック → stepLinkedStatusCode のドロップダウンが表示される
- [ ] stepLinkedStatusCode のドロップダウンに同事業のステータス定義が表示される
- [ ] ステップの編集 → モーダルで編集、stepCodeはdisabled
- [ ] ステップの削除 → 確認後に削除
- [ ] ドラッグ&ドロップで並び替え → stepNumberが自動再採番されて保存
- [ ] `npm run type-check` → エラーゼロ

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 7: 事業固有設定タブ

**対象ファイル**: `src/components/features/business/` 配下

**作業内容**:
1. BusinessConfigTab コンポーネント（構造化フォームモード + JSONエディタモード）

**確認チェック**:
- [ ] 「事業固有設定」タブ → 現在のbusiness_config が表示される
- [ ] 構造化フォームモードで settings.enableGanttChart を変更 → 保存後に反映
- [ ] JSONエディタモードに切り替え → JSON全体が編集可能
- [ ] 不正なJSON入力 → バリデーションエラー表示
- [ ] 正しいJSON入力で「保存」→ business_config が更新される
- [ ] `npm run type-check` → エラーゼロ
- [ ] `npm run build` → ビルド成功

**ゲート**: 上記の全項目が完了なら事業定義管理機能の実装完了。
