# Phase 1: 代理店マスタ詳細設計書（実装者向け）

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
7. [代理店担当者管理](#7-代理店担当者管理)
8. [代理店×事業リンク](#8-代理店事業リンク)
9. [ビジネスロジック](#9-ビジネスロジック)
10. [実装チェックリスト](#10-実装チェックリスト)

---

## 1. 実装概要

### 1.1 機能スコープ

| 機能 | 説明 |
|------|------|
| 代理店一覧 | 検索・フィルター・ソート・ページネーション付き一覧表示 |
| 代理店新規作成 | フォームによる代理店情報登録 |
| 代理店詳細 | タブ付き詳細画面（基本情報・担当者・事業リンク・階層構造） |
| 代理店編集 | 楽観的ロック付き更新 |
| 代理店論理削除 | `partner_is_active = false` による無効化 |
| 代理店復元 | 無効化された代理店の復元 |
| 代理店担当者CRUD | 代理店に紐づく担当者の追加・編集・削除（事業横断） |
| 代理店×事業リンク | 代理店と事業の紐付け管理（手数料率・事業内階層・カスタムデータ含む） |
| 代理店コード自動採番 | `AG-0001` 形式のコード自動生成 |
| 親代理店設定 | 全社マスタ階層（紹介関係の親子）の管理 |
| 契約期間管理 | 契約開始日・終了日の管理 |

### 1.2 関連テーブル

```
partners（代理店マスタ）
├── partner_contacts（代理店担当者）
├── partner_business_links（代理店×事業リンク）
├── partners（子代理店）※ partner_parent_id による自己参照
└── projects（案件）※ Phase 2で実装、Phase 1では関連タブにプレースホルダー表示
```

### 1.3 代理店階層の2種類管理

代理店の階層構造は以下の2つの独立した仕組みで管理する。

| 階層種別 | テーブル/カラム | 用途 | スコープ |
|---------|---------------|------|---------|
| 全社マスタ階層 | `partners.partner_parent_id` | 紹介関係の親子管理 | 全事業共通 |
| 事業内階層 | `partner_business_links.link_hierarchy_level` | 報酬管理・表示順制御 | 事業ごとに独立 |

### 1.4 ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/
│   │   └── partners/
│   │       ├── page.tsx                 # 代理店一覧
│   │       ├── new/
│   │       │   └── page.tsx             # 代理店新規作成
│   │       └── [id]/
│   │           ├── page.tsx             # 代理店詳細
│   │           └── edit/
│   │               └── page.tsx         # 代理店編集
│   └── api/v1/
│       └── partners/
│           ├── route.ts                 # GET(一覧), POST(作成)
│           ├── [id]/
│           │   ├── route.ts             # GET(詳細), PATCH(更新), DELETE(論理削除)
│           │   ├── restore/
│           │   │   └── route.ts         # PATCH(復元)
│           │   ├── contacts/
│           │   │   ├── route.ts         # GET(一覧), POST(作成)
│           │   │   └── [contactId]/
│           │   │       └── route.ts     # PATCH(更新), DELETE(削除)
│           │   └── business-links/
│           │       ├── route.ts         # GET(一覧), POST(作成)
│           │       └── [linkId]/
│           │           └── route.ts     # PATCH(更新), DELETE(削除)
│           ├── filter-options/
│           │   └── route.ts             # GET(フィルター選択肢)
│           └── csv-template/
│               └── route.ts             # GET(CSVテンプレート)
├── config/
│   └── entities/
│       └── partner.ts                   # 代理店設定オブジェクト
└── lib/
    └── validations/
        └── partner.ts                   # 代理店バリデーションスキーマ
```

---

## 2. Prismaスキーマ

### 2.1 Partner モデル

```prisma
model Partner {
  id                          Int       @id @default(autoincrement())
  partnerCode                 String    @unique @map("partner_code") @db.VarChar(20)
  partnerName                 String    @map("partner_name") @db.VarChar(200)
  partnerParentId             Int?      @map("partner_parent_id")
  partnerHierarchy            String    @default("1次代理店") @map("partner_hierarchy") @db.VarChar(20)
  partnerPostalCode           String?   @map("partner_postal_code") @db.VarChar(10)
  partnerAddress              String?   @map("partner_address")
  partnerPhone                String?   @map("partner_phone") @db.VarChar(20)
  partnerEmail                String?   @map("partner_email") @db.VarChar(255)
  partnerWebsite              String?   @map("partner_website") @db.VarChar(500)
  partnerContractStartDate    Date?     @map("partner_contract_start_date")
  partnerContractEndDate      Date?     @map("partner_contract_end_date")
  partnerNotes                String?   @map("partner_notes")
  partnerIsActive             Boolean   @default(true) @map("partner_is_active")
  version                     Int       @default(1)

  createdAt                   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt                   DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  createdBy                   Int?      @map("created_by")
  updatedBy                   Int?      @map("updated_by")

  // リレーション
  parent                      Partner?  @relation("PartnerHierarchy", fields: [partnerParentId], references: [id])
  children                    Partner[] @relation("PartnerHierarchy")
  contacts                    PartnerContact[]
  businessLinks               PartnerBusinessLink[]
  creator                     User?     @relation("PartnerCreator", fields: [createdBy], references: [id])
  updater                     User?     @relation("PartnerUpdater", fields: [updatedBy], references: [id])

  @@map("partners")
}
```

### 推奨インデックス設計

```prisma
model Partner {
  // ... 既存フィールド ...

  @@index([partnerCode, partnerIsActive], map: "idx_partners_code_active")
  @@index([partnerName], map: "idx_partners_name")
  @@index([partnerType], map: "idx_partners_type")
  @@index([partnerParentId], map: "idx_partners_parent")
  @@index([partnerIsActive, updatedAt], map: "idx_partners_active_updated")
  @@map("partners")
}
```

**インデックス設計の根拠**:

| インデックス | 用途 | クエリパターン |
|---|---|---|
| `idx_partners_code_active` | 一覧表示・コード検索 | `WHERE partner_is_active = true ORDER BY partner_code` |
| `idx_partners_name` | 代理店名検索（LIKE前方一致） | `WHERE partner_name LIKE '株式会社%'` |
| `idx_partners_type` | 種別フィルター | `WHERE partner_type = '法人'` |
| `idx_partners_parent` | 親代理店検索・階層ツリー構築 | `WHERE partner_parent_id = ?` |
| `idx_partners_active_updated` | アクティブ代理店の更新日ソート | `WHERE partner_is_active = true ORDER BY updated_at DESC` |

### 2.2 PartnerContact モデル

```prisma
model PartnerContact {
  id                Int       @id @default(autoincrement())
  partnerId         Int       @map("partner_id")
  contactName       String    @map("contact_name") @db.VarChar(100)
  contactDepartment String?   @map("contact_department") @db.VarChar(100)
  contactPosition   String?   @map("contact_position") @db.VarChar(100)
  contactPhone      String?   @map("contact_phone") @db.VarChar(20)
  contactEmail      String?   @map("contact_email") @db.VarChar(255)
  contactIsPrimary  Boolean   @default(false) @map("contact_is_primary")
  contactSortOrder  Int       @default(0) @map("contact_sort_order")

  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // リレーション
  partner           Partner   @relation(fields: [partnerId], references: [id])

  @@map("partner_contacts")
}
```

> **顧客担当者との違い**: 代理店担当者は `business_id` フィールドを持たない。代理店担当者は事業横断で管理される。

### 2.3 PartnerBusinessLink モデル

```prisma
model PartnerBusinessLink {
  id                 Int       @id @default(autoincrement())
  partnerId          Int       @map("partner_id")
  businessId         Int       @map("business_id")
  linkStatus         String    @default("active") @map("link_status") @db.VarChar(20)
  linkHierarchyLevel String?   @map("link_hierarchy_level") @db.VarChar(20)
  linkCommissionRate Decimal?  @map("link_commission_rate") @db.Decimal(5, 2)
  linkDisplayOrder   Int       @default(0) @map("link_display_order")
  linkStartDate      Date?     @map("link_start_date")
  linkEndDate        Date?     @map("link_end_date")
  linkCustomData     Json      @default("{}") @map("link_custom_data") @db.JsonB

  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // リレーション
  partner            Partner   @relation(fields: [partnerId], references: [id])
  business           Business  @relation(fields: [businessId], references: [id])

  @@unique([partnerId, businessId])
  @@map("partner_business_links")
}
```

> **顧客事業リンクとの違い**: 代理店事業リンクには `linkHierarchyLevel`（事業内階層）、`linkCommissionRate`（手数料率）、`linkDisplayOrder`（表示順）、`linkStartDate`/`linkEndDate`（期間）のフィールドが追加されている。

---

## 3. シードデータ

### 3.1 代理店マスタ

```typescript
const partners = [
  {
    partnerCode: "AG-0001",
    partnerName: "株式会社エナジーパートナーズ",
    partnerParentId: null,
    partnerHierarchy: "1次代理店",
    partnerPostalCode: "105-0001",
    partnerAddress: "東京都港区虎ノ門1-1-1",
    partnerPhone: "03-1111-2222",
    partnerEmail: "info@energy-partners.co.jp",
    partnerWebsite: "https://energy-partners.co.jp",
    partnerContractStartDate: new Date("2025-01-01"),
    partnerContractEndDate: new Date("2026-12-31"),
  },
  {
    partnerCode: "AG-0002",
    partnerName: "合同会社グリーンソリューションズ",
    partnerParentId: null,
    partnerHierarchy: "1次代理店",
    partnerPostalCode: "541-0041",
    partnerAddress: "大阪府大阪市中央区北浜1-2-3",
    partnerPhone: "06-3333-4444",
    partnerEmail: "contact@green-solutions.jp",
    partnerContractStartDate: new Date("2025-02-01"),
    partnerContractEndDate: null,
  },
  {
    partnerCode: "AG-0003",
    partnerName: "株式会社サンライズ商事",
    partnerParentId: 1, // AG-0001の子代理店
    partnerHierarchy: "2次代理店",
    partnerPostalCode: "460-0003",
    partnerAddress: "愛知県名古屋市中区錦2-3-4",
    partnerPhone: "052-5555-6666",
    partnerEmail: "info@sunrise-trading.co.jp",
    partnerContractStartDate: new Date("2025-03-01"),
    partnerContractEndDate: new Date("2026-03-31"),
  },
  {
    partnerCode: "AG-0004",
    partnerName: "有限会社テクノブリッジ",
    partnerParentId: 1, // AG-0001の子代理店
    partnerHierarchy: "2次代理店",
    partnerPostalCode: "812-0012",
    partnerAddress: "福岡県福岡市博多区博多駅中央街5-6-7",
    partnerPhone: "092-7777-8888",
    partnerEmail: "sales@techno-bridge.co.jp",
    partnerContractStartDate: new Date("2025-04-01"),
    partnerContractEndDate: null,
  },
  {
    partnerCode: "AG-0005",
    partnerName: "株式会社ノーザンエージェント",
    partnerParentId: 2, // AG-0002の子代理店
    partnerHierarchy: "2次代理店",
    partnerPostalCode: "060-0001",
    partnerAddress: "北海道札幌市中央区北一条西3-4-5",
    partnerPhone: "011-9999-0000",
    partnerEmail: "info@northern-agent.jp",
    partnerContractStartDate: new Date("2025-05-01"),
    partnerContractEndDate: new Date("2026-04-30"),
  },
];
```

### 3.2 代理店担当者

```typescript
const partnerContacts = [
  // AG-0001: 株式会社エナジーパートナーズ
  {
    partnerId: 1, // AG-0001
    contactName: "伊藤健一",
    contactDepartment: "営業部",
    contactPosition: "部長",
    contactPhone: "03-1111-2223",
    contactEmail: "ito@energy-partners.co.jp",
    contactIsPrimary: true,
    contactSortOrder: 0,
  },
  {
    partnerId: 1, // AG-0001
    contactName: "渡辺美穂",
    contactDepartment: "営業部",
    contactPosition: "主任",
    contactPhone: "03-1111-2224",
    contactEmail: "watanabe@energy-partners.co.jp",
    contactIsPrimary: false,
    contactSortOrder: 1,
  },
  // AG-0002: 合同会社グリーンソリューションズ
  {
    partnerId: 2, // AG-0002
    contactName: "木村大輔",
    contactDepartment: "代理店推進部",
    contactPosition: "マネージャー",
    contactPhone: "06-3333-4445",
    contactEmail: "kimura@green-solutions.jp",
    contactIsPrimary: true,
    contactSortOrder: 0,
  },
  // AG-0003: 株式会社サンライズ商事
  {
    partnerId: 3, // AG-0003
    contactName: "松本直樹",
    contactDepartment: "総務部",
    contactPosition: "課長",
    contactPhone: "052-5555-6667",
    contactEmail: "matsumoto@sunrise-trading.co.jp",
    contactIsPrimary: true,
    contactSortOrder: 0,
  },
];
```

### 3.3 代理店×事業リンク

```typescript
const partnerBusinessLinks = [
  {
    partnerId: 1,
    businessId: 1,
    linkStatus: "active",
    linkHierarchyLevel: "1",
    linkCommissionRate: 10.00,
    linkDisplayOrder: 0,
    linkStartDate: new Date("2025-01-01"),
    linkEndDate: null,
  }, // AG-0001 × MOAG事業（1次, 10%）
  {
    partnerId: 1,
    businessId: 2,
    linkStatus: "active",
    linkHierarchyLevel: "1",
    linkCommissionRate: 8.50,
    linkDisplayOrder: 0,
    linkStartDate: new Date("2025-01-01"),
    linkEndDate: null,
  }, // AG-0001 × サービスA事業（1次, 8.5%）
  {
    partnerId: 2,
    businessId: 1,
    linkStatus: "active",
    linkHierarchyLevel: "1",
    linkCommissionRate: 10.00,
    linkDisplayOrder: 1,
    linkStartDate: new Date("2025-02-01"),
    linkEndDate: null,
  }, // AG-0002 × MOAG事業（1次, 10%）
  {
    partnerId: 3,
    businessId: 1,
    linkStatus: "active",
    linkHierarchyLevel: "1-2",
    linkCommissionRate: 5.00,
    linkDisplayOrder: 2,
    linkStartDate: new Date("2025-03-01"),
    linkEndDate: null,
  }, // AG-0003 × MOAG事業（2次, 5%）
  {
    partnerId: 4,
    businessId: 2,
    linkStatus: "active",
    linkHierarchyLevel: "1-2",
    linkCommissionRate: 4.00,
    linkDisplayOrder: 1,
    linkStartDate: new Date("2025-04-01"),
    linkEndDate: null,
  }, // AG-0004 × サービスA事業（2次, 4%）
];
```

---

## 4. 設定オブジェクト

### 4.1 代理店一覧設定（partnerListConfig）

```typescript
// config/entities/partner.ts
import { EntityListConfig } from "@/types/config";

export const partnerListConfig: EntityListConfig = {
  entityType: "partner",
  apiEndpoint: "/api/v1/partners",
  title: "代理店一覧",

  columns: [
    {
      key: "partnerCode",
      label: "代理店コード",
      width: 130,
      sortable: true,
      locked: true,
    },
    {
      key: "partnerName",
      label: "代理店名",
      width: 200,
      sortable: true,
      locked: true,
    },
    {
      key: "partnerHierarchy",
      label: "階層",
      width: 110,
      sortable: true,
      editable: {
        type: "select",
        options: [
          { value: "1次代理店", label: "1次代理店" },
          { value: "2次代理店", label: "2次代理店" },
          { value: "3次代理店", label: "3次代理店" },
        ],
      },
    },
    {
      key: "parentPartnerName",
      label: "親代理店",
      width: 180,
    },
    {
      key: "partnerPhone",
      label: "電話番号",
      width: 140,
    },
    {
      key: "partnerContractStartDate",
      label: "契約開始日",
      width: 110,
      sortable: true,
      render: (value) => `formatDate(value)`,
    },
    {
      key: "partnerContractEndDate",
      label: "契約終了日",
      width: 110,
      sortable: true,
      render: (value) => `formatDate(value)`,
    },
    {
      key: "contactCount",
      label: "担当者数",
      width: 90,
      align: "right",
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
    placeholder: "代理店名、代理店コードで検索",
    fields: ["partnerName", "partnerCode"],
    debounceMs: 300,
  },

  filters: [
    {
      key: "partnerHierarchy",
      label: "階層",
      type: "select",
      options: [
        { value: "1次代理店", label: "1次代理店" },
        { value: "2次代理店", label: "2次代理店" },
        { value: "3次代理店", label: "3次代理店" },
      ],
    },
    {
      key: "contractStatus",
      label: "契約状態",
      type: "select",
      options: [
        { value: "active", label: "契約中" },
        { value: "expired", label: "契約終了" },
        { value: "noContract", label: "未設定" },
      ],
    },
  ],

  defaultSort: { field: "partnerCode", direction: "asc" },

  tableSettings: {
    persistKey: "partner_list",
    defaultPageSize: 25,
    defaultDensity: "normal",
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },

  detailPath: (id) => `/partners/${id}`,
  createPath: "/partners/new",

  csv: {
    importEnabled: true,
    exportEnabled: true,
    templatePath: "/api/v1/partners/csv-template",
  },

  batchActions: [
    {
      key: "delete",
      label: "一括削除",
      variant: "destructive",
      confirm: {
        title: "代理店の一括削除",
        message: (count) =>
          `選択した${count}件の代理店を削除します。この操作は論理削除です。`,
      },
      apiEndpoint: "/api/v1/partners/batch/delete",
      requiredRole: ["admin"],
    },
  ],
};
```

### 4.2 代理店詳細設定（partnerDetailConfig）

```typescript
import { EntityDetailConfig } from "@/types/config";

export const partnerDetailConfig: EntityDetailConfig = {
  entityType: "partner",
  apiEndpoint: "/api/v1/partners",
  title: "代理店詳細",

  editPath: (id) => `/partners/${id}/edit`,
  listPath: "/partners",

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
              { key: "partnerCode", label: "代理店コード" },
              { key: "partnerName", label: "代理店名" },
              { key: "partnerHierarchy", label: "全社マスタ階層" },
              { key: "parentPartnerName", label: "親代理店", format: "link", linkPath: (data) => `/partners/${data.partnerParentId}` },
            ],
          },
          {
            title: "連絡先",
            columns: 2,
            fields: [
              { key: "partnerPostalCode", label: "郵便番号" },
              { key: "partnerAddress", label: "住所", colSpan: 2 },
              { key: "partnerPhone", label: "電話番号" },
              { key: "partnerEmail", label: "メールアドレス" },
              { key: "partnerWebsite", label: "Webサイト", format: "link" },
            ],
          },
          {
            title: "契約情報",
            columns: 2,
            fields: [
              { key: "partnerContractStartDate", label: "契約開始日", format: "date" },
              { key: "partnerContractEndDate", label: "契約終了日", format: "date" },
            ],
          },
          {
            title: "備考",
            columns: 1,
            fields: [
              { key: "partnerNotes", label: "備考", format: "text" },
            ],
          },
        ],
      } as InfoTabConfig,
    },
    {
      key: "contacts",
      label: "担当者",
      component: "custom",
      // PartnerContactsTab コンポーネントを使用（後述）
    },
    {
      key: "businessLinks",
      label: "事業リンク",
      component: "custom",
      // PartnerBusinessLinksTab コンポーネントを使用（後述）
    },
    {
      key: "hierarchy",
      label: "階層構造",
      component: "custom",
      // PartnerHierarchyTab コンポーネントを使用（後述）
    },
    {
      key: "projects",
      label: "関連案件",
      component: "related",
      config: {
        apiEndpoint: "/api/v1/projects",
        filterKey: "partnerId",
        columns: [
          { key: "projectNo", label: "案件番号", width: 120 },
          { key: "projectName", label: "案件名", width: 200 },
          { key: "projectSalesStatus", label: "ステータス", width: 100 },
          { key: "projectAmount", label: "金額", width: 100, align: "right" },
        ],
        emptyMessage: "この代理店に紐づく案件はありません",
        detailPath: (id) => `/projects/${id}`,
      } as RelatedTabConfig,
    },
  ],

  deleteConfig: {
    confirm: {
      title: "代理店の削除",
      message: "この代理店を削除（無効化）しますか？紐づく担当者・事業リンクは保持されます。子代理店の親代理店参照はそのまま残ります。",
    },
    apiEndpoint: "/api/v1/partners",
  },
};
```

### 4.3 代理店フォーム設定（partnerFormConfig）

```typescript
import { EntityFormConfig } from "@/types/config";
import { partnerCreateSchema, partnerUpdateSchema } from "@/lib/validations/partner";

export const partnerFormConfig: EntityFormConfig = {
  entityType: "partner",
  apiEndpoint: "/api/v1/partners",
  title: { create: "代理店新規登録", edit: "代理店編集" },
  redirectAfterSave: (id) => `/partners/${id}`,

  sections: [
    {
      title: "基本情報",
      columns: 2,
      fields: [
        {
          key: "partnerName",
          label: "代理店名",
          type: "text",
          required: true,
          placeholder: "例: 株式会社エナジーパートナーズ",
        },
        {
          key: "partnerHierarchy",
          label: "全社マスタ階層",
          type: "select",
          options: [
            { value: "1次代理店", label: "1次代理店" },
            { value: "2次代理店", label: "2次代理店" },
            { value: "3次代理店", label: "3次代理店" },
          ],
        },
        {
          key: "partnerParentId",
          label: "親代理店",
          type: "async-select",
          optionsEndpoint: "/api/v1/partners/filter-options",
          optionsKey: "partners",
          placeholder: "親代理店を選択（任意）",
          helpText: "紹介関係の親代理店を設定します。全事業共通の階層です。",
        },
      ],
    },
    {
      title: "連絡先",
      columns: 2,
      fields: [
        {
          key: "partnerPostalCode",
          label: "郵便番号",
          type: "text",
          placeholder: "例: 105-0001",
        },
        {
          key: "partnerAddress",
          label: "住所",
          type: "text",
          colSpan: 2,
          placeholder: "例: 東京都港区虎ノ門1-1-1",
        },
        {
          key: "partnerPhone",
          label: "電話番号",
          type: "text",
          placeholder: "例: 03-1111-2222",
        },
        {
          key: "partnerEmail",
          label: "メールアドレス",
          type: "email",
          placeholder: "例: info@example.co.jp",
        },
        {
          key: "partnerWebsite",
          label: "Webサイト",
          type: "text",
          placeholder: "例: https://example.co.jp",
        },
      ],
    },
    {
      title: "契約情報",
      columns: 2,
      fields: [
        {
          key: "partnerContractStartDate",
          label: "契約開始日",
          type: "date",
        },
        {
          key: "partnerContractEndDate",
          label: "契約終了日",
          type: "date",
        },
      ],
    },
    {
      title: "備考",
      columns: 1,
      fields: [
        {
          key: "partnerNotes",
          label: "備考",
          type: "textarea",
          placeholder: "備考を入力",
        },
      ],
    },
  ],

  validationSchema: {
    create: partnerCreateSchema,
    edit: partnerUpdateSchema,
  },
};
```

---

## 5. ページ実装

### 5.1 代理店一覧ページ

```typescript
// src/app/(auth)/partners/page.tsx
import { EntityListTemplate } from "@/components/templates/entity-list-template";
import { partnerListConfig } from "@/config/entities/partner";

export default function PartnerListPage() {
  return <EntityListTemplate config={partnerListConfig} />;
}
```

### 5.2 代理店新規作成ページ

```typescript
// src/app/(auth)/partners/new/page.tsx
import { EntityFormTemplate } from "@/components/templates/entity-form-template";
import { partnerFormConfig } from "@/config/entities/partner";

export default function PartnerCreatePage() {
  return <EntityFormTemplate config={partnerFormConfig} />;
}
```

### 5.3 代理店詳細ページ

```typescript
// src/app/(auth)/partners/[id]/page.tsx
import { EntityDetailTemplate } from "@/components/templates/entity-detail-template";
import { partnerDetailConfig } from "@/config/entities/partner";
import { PartnerContactsTab } from "@/components/features/partner/partner-contacts-tab";
import { PartnerBusinessLinksTab } from "@/components/features/partner/partner-business-links-tab";
import { PartnerHierarchyTab } from "@/components/features/partner/partner-hierarchy-tab";

export default function PartnerDetailPage({ params }: { params: { id: string } }) {
  const customTabs = {
    contacts: PartnerContactsTab,
    businessLinks: PartnerBusinessLinksTab,
    hierarchy: PartnerHierarchyTab,
  };

  return (
    <EntityDetailTemplate
      config={partnerDetailConfig}
      id={params.id}
      customTabs={customTabs}
    />
  );
}
```

### 5.4 代理店編集ページ

```typescript
// src/app/(auth)/partners/[id]/edit/page.tsx
import { EntityFormTemplate } from "@/components/templates/entity-form-template";
import { partnerFormConfig } from "@/config/entities/partner";

export default function PartnerEditPage({ params }: { params: { id: string } }) {
  return <EntityFormTemplate config={partnerFormConfig} id={params.id} />;
}
```

---

## 6. バリデーション

### 6.1 Zodスキーマ

```typescript
// src/lib/validations/partner.ts
import { z } from "zod";

// 代理店新規作成スキーマ
export const partnerCreateSchema = z.object({
  partnerName: z
    .string()
    .min(1, "代理店名は必須です")
    .max(200, "代理店名は200文字以内で入力してください"),
  partnerParentId: z
    .number()
    .int("親代理店IDが不正です")
    .optional()
    .nullable(),
  partnerHierarchy: z
    .enum(["1次代理店", "2次代理店", "3次代理店"])
    .default("1次代理店"),
  partnerPostalCode: z
    .string()
    .regex(/^\d{3}-?\d{4}$/, "郵便番号の形式が正しくありません（例: 105-0001）")
    .optional()
    .or(z.literal("")),
  partnerAddress: z.string().optional().or(z.literal("")),
  partnerPhone: z
    .string()
    .regex(/^[\d\-+()]+$/, "電話番号の形式が正しくありません")
    .optional()
    .or(z.literal("")),
  partnerEmail: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  partnerWebsite: z
    .string()
    .url("URLの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  partnerContractStartDate: z.coerce.date().optional().nullable(),
  partnerContractEndDate: z.coerce.date().optional().nullable(),
  partnerNotes: z.string().optional().or(z.literal("")),
}).refine(
  (data) => {
    if (data.partnerContractStartDate && data.partnerContractEndDate) {
      return data.partnerContractStartDate <= data.partnerContractEndDate;
    }
    return true;
  },
  {
    message: "契約終了日は契約開始日以降の日付を指定してください",
    path: ["partnerContractEndDate"],
  }
);

// 代理店更新スキーマ（version必須）
export const partnerUpdateSchema = partnerCreateSchema.extend({
  version: z.number().int("バージョンが不正です"),
});

// 代理店担当者スキーマ
export const partnerContactSchema = z.object({
  contactName: z
    .string()
    .min(1, "担当者名は必須です")
    .max(100, "担当者名は100文字以内で入力してください"),
  contactDepartment: z
    .string()
    .max(100, "部署名は100文字以内で入力してください")
    .optional()
    .or(z.literal("")),
  contactPosition: z
    .string()
    .max(100, "役職は100文字以内で入力してください")
    .optional()
    .or(z.literal("")),
  contactPhone: z
    .string()
    .regex(/^[\d\-+()]+$/, "電話番号の形式が正しくありません")
    .optional()
    .or(z.literal("")),
  contactEmail: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  contactIsPrimary: z.boolean().default(false),
});

// 代理店×事業リンクスキーマ
export const partnerBusinessLinkSchema = z.object({
  businessId: z.number().int("事業IDが不正です"),
  linkStatus: z
    .enum(["active", "inactive"])
    .default("active"),
  linkHierarchyLevel: z
    .string()
    .max(20, "階層レベルは20文字以内で入力してください")
    .optional()
    .or(z.literal("")),
  linkCommissionRate: z
    .number()
    .min(0, "手数料率は0以上で入力してください")
    .max(100, "手数料率は100以下で入力してください")
    .optional()
    .nullable(),
  linkDisplayOrder: z
    .number()
    .int("表示順は整数で入力してください")
    .min(0, "0以上の値を入力してください")
    .default(0),
  linkStartDate: z.coerce.date().optional().nullable(),
  linkEndDate: z.coerce.date().optional().nullable(),
  linkCustomData: z.record(z.unknown()).default({}),
}).refine(
  (data) => {
    if (data.linkStartDate && data.linkEndDate) {
      return data.linkStartDate <= data.linkEndDate;
    }
    return true;
  },
  {
    message: "終了日は開始日以降の日付を指定してください",
    path: ["linkEndDate"],
  }
);

export type PartnerCreateInput = z.infer<typeof partnerCreateSchema>;
export type PartnerUpdateInput = z.infer<typeof partnerUpdateSchema>;
export type PartnerContactInput = z.infer<typeof partnerContactSchema>;
export type PartnerBusinessLinkInput = z.infer<typeof partnerBusinessLinkSchema>;
```

---

## 7. 代理店担当者管理

### 7.1 UI仕様

代理店詳細画面の「担当者」タブにインラインでCRUD機能を提供する。

**表示:**
- テーブル形式で担当者一覧を表示
- 列: 担当者名 / 部署 / 役職 / 電話番号 / メール / 主担当
- 主担当者にはバッジ表示

> **顧客担当者との違い**: 代理店担当者には「事業」列がない。代理店担当者は事業横断で管理されるため、`business_id` フィールドを持たない。

**操作:**
- 「担当者を追加」ボタン → モーダルフォームを表示
- 行の編集アイコン → モーダルフォームで編集
- 行の削除アイコン → 確認ダイアログ後に物理削除

**主担当制約:**
- 代理店全体で主担当は1名まで（事業スコープによる分割はない）
- 主担当を設定すると、既存の主担当は自動解除される

### 7.2 コンポーネント

```typescript
// src/components/features/partner/partner-contacts-tab.tsx
"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PartnerContactFormModal } from "./partner-contact-form-modal";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Props = {
  entityId: number;
};

export function PartnerContactsTab({ entityId }: Props) {
  // 担当者一覧取得
  // モーダル表示制御
  // CRUD操作
  // 主担当の排他制御（代理店全体で1名）
}
```

---

## 8. 代理店×事業リンク

### 8.1 UI仕様

代理店詳細画面の「事業リンク」タブで管理する。

**表示:**
- テーブル形式で紐づき事業一覧を表示
- 列: 事業名 / ステータス / 事業内階層 / 手数料率（%） / 表示順 / 開始日 / 終了日 / カスタムデータ（事業固有フィールド）

> **顧客事業リンクとの違い**: 代理店事業リンクには手数料率、事業内階層、表示順、期間のフィールドが追加されている。

**操作:**
- 「事業を紐付け」ボタン → 未紐付けの事業をドロップダウンから選択し、手数料率・階層等を入力
- ステータス変更（active / inactive）
- 手数料率・事業内階層の編集（インライン編集またはモーダル）
- 紐付け解除（物理削除）

**事業内階層（link_hierarchy_level）:**
- 事業ごとに独立した階層管理（例: "1", "1-2", "2-1"）
- 全社マスタ階層（partner_parent_id）とは独立して設定可能
- 報酬計算・表示順の制御に使用

**カスタムデータ:**
- `business_config.partnerFields` に定義されたフィールドを動的フォームで表示
- 事業ごとに異なるフィールド構成を持つ

### 8.2 コンポーネント

```typescript
// src/components/features/partner/partner-business-links-tab.tsx
"use client";

import { DataTable } from "@/components/ui/data-table";
import { PartnerBusinessLinkFormModal } from "./partner-business-link-form-modal";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/hooks/use-business";

type Props = {
  entityId: number;
};

export function PartnerBusinessLinksTab({ entityId }: Props) {
  // 事業リンク一覧取得
  // リンク追加（手数料率・階層の入力フォーム付き）
  // リンク編集（手数料率・階層・カスタムデータ）
  // リンク削除
}
```

### 8.3 階層構造タブ

代理店詳細画面の「階層構造」タブで、全社マスタ階層（紹介関係の親子構造）をツリー表示する。

```typescript
// src/components/features/partner/partner-hierarchy-tab.tsx
"use client";

type Props = {
  entityId: number;
};

export function PartnerHierarchyTab({ entityId }: Props) {
  // 親代理店→当該代理店→子代理店のツリー表示
  // 各ノードに代理店コード・代理店名・階層レベルを表示
  // ノードクリックで該当代理店の詳細ページへ遷移
}
```

---

## 9. ビジネスロジック

### 9.1 代理店コード自動採番

```typescript
/**
 * 代理店コード自動採番
 * 形式: AG-{4桁連番} （例: AG-0001, AG-0002）
 *
 * 実装方針:
 * 1. partners テーブルから partner_code の最大値を取得
 * 2. プレフィックス "AG-" を除去し、数値部分を +1
 * 3. 4桁ゼロパディング
 * 4. UNIQUE制約で競合時はリトライ（最大5回、exponential backoff）
 * 5. 5回失敗時は 503 Service Unavailable（CODE_GENERATION_FAILED）
 */
async function generatePartnerCode(prisma: PrismaClient): Promise<string> {
  const PREFIX = "AG-";
  const maxRetries = 5;
  const baseDelay = 50; // ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const lastPartner = await prisma.partner.findFirst({
      where: { partnerCode: { startsWith: PREFIX } },
      orderBy: { partnerCode: "desc" },
      select: { partnerCode: true },
    });

    let nextNumber = 1;
    if (lastPartner) {
      const numPart = parseInt(lastPartner.partnerCode.replace(PREFIX, ""), 10);
      nextNumber = numPart + 1;
    }

    const code = `${PREFIX}${String(nextNumber).padStart(4, "0")}`;

    try {
      // 存在チェック（UNIQUE制約のフォールバック）
      const exists = await prisma.partner.findUnique({
        where: { partnerCode: code },
      });
      if (!exists) return code;
    } catch {
      // リトライ
    }
  }

  // 503 Service Unavailable with CODE_GENERATION_FAILED error code
  throw new AppError({
    statusCode: 503,
    errorCode: "CODE_GENERATION_FAILED",
    message: "代理店コードの採番に失敗しました。時間をおいて再度お試しください。",
  });
}
```

### 9.2 楽観的ロック

Phase 0で実装済みのPrisma middlewareを利用する。代理店更新時のフローは以下の通り:

```
1. クライアント → PATCH /api/v1/partners/:id { ...data, version: 3 }
2. サーバー → Prisma middleware が version チェック
3. version 一致 → 更新実行、version を 4 にインクリメント
4. version 不一致 → 409 Conflict レスポンス
5. クライアント → ConflictErrorModal 表示 → 「最新データを読み込む」or「編集を続ける」
```

### 9.2.1 楽観的ロック競合時のUX仕様

代理店編集画面で409 Conflictが返された場合、以下のUXフローで競合を解決する。

**競合検知時の表示:**

```
┌─────────────────────────────────────────────────┐
│  更新の競合が検出されました                           │
│                                                   │
│  この代理店は別のユーザーによって更新されています。        │
│  あなたの変更を保存するには、最新データを確認してください。  │
│                                                   │
│  競合フィールド:                                    │
│  ┌───────────────┬──────────┬──────────┐          │
│  │ フィールド      │ あなたの値 │ 最新の値  │          │
│  ├───────────────┼──────────┼──────────┤          │
│  │ 代理店名       │ 株式会社A │ 株式会社B │          │
│  │ 電話番号       │ 03-1234  │ 03-5678  │          │
│  └───────────────┴──────────┴──────────┘          │
│                                                   │
│  [最新データで上書き]  [編集を続ける]  [キャンセル]      │
└─────────────────────────────────────────────────┘
```

**各ボタンの動作:**

| ボタン | 動作 |
|-------|------|
| 最新データで上書き | サーバーから最新データを取得し、フォームの全フィールドを最新値でリセット。versionも最新に更新。ユーザーの未保存変更は破棄される。 |
| 編集を続ける | モーダルを閉じ、フォームの編集状態を維持。ユーザーは内容を確認・修正した上で再度保存を試みる。この際、versionは最新値に自動更新される。 |
| キャンセル | 編集を中断し、代理店詳細画面に戻る。未保存の変更は破棄される。 |

**実装上の注意点:**
- 409レスポンスのbodyに最新のデータとversionを含めて返却する
- フィールド単位の差分表示は、送信データと最新データを比較して変更があるフィールドのみ表示する
- 「編集を続ける」選択時は、次回保存時に最新のversionを使用するようフォーム内部のversionを更新する

### 9.3 論理削除

```
DELETE /api/v1/partners/:id
→ partner_is_active = false に更新
→ 子データ（contacts, business_links）は変更しない
→ 子代理店の partner_parent_id はそのまま保持（参照整合性維持）
→ 204 No Content レスポンス

PATCH /api/v1/partners/:id/restore
→ partner_is_active = true に復元
→ 200 OK レスポンス（復元後のデータ）
```

### 9.4 親代理店の循環参照防止

```typescript
/**
 * 親代理店設定時の循環参照チェック
 *
 * 代理店Aの親代理店を代理店Bに設定する際、
 * 代理店Bの祖先をたどって代理店Aが存在しないことを確認する。
 *
 * 例: A → B → C の階層で、CのparentをAに設定すると循環が発生するためエラーとする。
 */
async function validateNoCircularReference(
  prisma: PrismaClient,
  partnerId: number,
  parentId: number
): Promise<boolean> {
  const maxDepth = 10; // 無限ループ防止
  let currentId: number | null = parentId;

  for (let depth = 0; depth < maxDepth; depth++) {
    if (currentId === null) return true; // ルートに到達、循環なし
    if (currentId === partnerId) return false; // 循環検出

    const partner = await prisma.partner.findUnique({
      where: { id: currentId },
      select: { partnerParentId: true },
    });

    if (!partner) return true; // 存在しない親、循環なし
    currentId = partner.partnerParentId;
  }

  return false; // 最大深度超過、安全のためエラー
}
```

### 9.5 契約期間チェック

```typescript
/**
 * 契約期間のビジネスルール:
 * - 契約終了日が過去の場合、一覧で「契約終了」ステータスを表示
 * - 契約終了日の30日前からアラート表示
 * - 契約期間未設定の場合は「未設定」ステータスを表示
 */
function getContractStatus(
  startDate: Date | null,
  endDate: Date | null
): "active" | "expired" | "expiring" | "noContract" {
  if (!startDate && !endDate) return "noContract";
  if (!endDate) return "active"; // 終了日未設定は無期限契約

  const now = new Date();
  if (endDate < now) return "expired";

  const thirtyDaysBefore = new Date(endDate);
  thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);
  if (now >= thirtyDaysBefore) return "expiring";

  return "active";
}
```

### 9.6 監査ログ

Phase 0で実装済みのPrisma middlewareにより、partnersテーブルの INSERT/UPDATE/DELETE を自動記録する。

記録対象フィールド: 全フィールド（version, created_at, updated_at を除く）

---

## 10. 実装チェックリスト

### Step 1: Prismaスキーマ拡張

**対象ファイル**: `prisma/schema.prisma`, `prisma/seed.ts`

**作業内容**:
1. Partner, PartnerContact, PartnerBusinessLink モデルを追加
2. マイグレーション実行
3. シードデータ追加（代理店5件 + 担当者4件 + 事業リンク5件）

**確認チェック**:
- [ ] `npx prisma migrate dev --name add_partners` → マイグレーション成功
- [ ] `npx prisma db seed` → シードデータ投入成功
- [ ] `npx prisma studio` → partners テーブル: 5件、partner_contacts: 4件、partner_business_links: 5件
- [ ] 親代理店の自己参照リレーション: AG-0003 → AG-0001、AG-0004 → AG-0001、AG-0005 → AG-0002 が確認できる
- [ ] `npm run type-check` → エラーゼロ

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 2: API実装

**対象ファイル**: `src/app/api/v1/partners/` 配下

**作業内容**:
1. 代理店一覧API（GET /api/v1/partners） — 検索・フィルター・ソート・ページネーション
2. 代理店作成API（POST /api/v1/partners） — バリデーション + 自動採番 + 循環参照チェック
3. 代理店詳細API（GET /api/v1/partners/:id） — 親代理店名の結合返却
4. 代理店更新API（PATCH /api/v1/partners/:id） — 楽観的ロック + 循環参照チェック
5. 代理店論理削除API（DELETE /api/v1/partners/:id）
6. 代理店復元API（PATCH /api/v1/partners/:id/restore）
7. フィルター選択肢API（GET /api/v1/partners/filter-options） — 親代理店選択肢含む
8. 担当者CRUD API
9. 事業リンクCRUD API（手数料率・事業内階層の管理含む）

**確認チェック**:
- [ ] `GET /api/v1/partners` → 5件のデータが返却される（ページネーション付き）
- [ ] `GET /api/v1/partners?search=エナジー` → 1件にフィルタリングされる
- [ ] `GET /api/v1/partners?partnerHierarchy=2次代理店` → 3件にフィルタリングされる
- [ ] `POST /api/v1/partners` → 代理店が作成され、partnerCodeが "AG-0006" で自動採番される
- [ ] `POST /api/v1/partners` → partnerName未指定時に400 VALIDATION_ERROR
- [ ] `POST /api/v1/partners` → 循環参照となるpartnerParentId指定時に400エラー
- [ ] `PATCH /api/v1/partners/1` → version一致で更新成功
- [ ] `PATCH /api/v1/partners/1` → version不一致で409 CONFLICT
- [ ] `DELETE /api/v1/partners/1` → partner_is_active = false に更新
- [ ] `PATCH /api/v1/partners/1/restore` → partner_is_active = true に復元
- [ ] `GET /api/v1/partners/1/contacts` → 2件の担当者が返却される
- [ ] `GET /api/v1/partners/1/business-links` → 2件の事業リンクが返却される（手数料率含む）
- [ ] `POST /api/v1/partners/1/business-links` → 手数料率・事業内階層を含むリンク作成
- [ ] `npm run type-check` → エラーゼロ

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 3: 設定オブジェクト + バリデーション

**対象ファイル**: `src/config/entities/partner.ts`, `src/lib/validations/partner.ts`

**作業内容**:
1. partnerListConfig, partnerDetailConfig, partnerFormConfig の作成
2. Zodバリデーションスキーマの作成（契約期間の整合性チェック含む）

**確認チェック**:
- [ ] `npm run type-check` → エラーゼロ
- [ ] partner.ts に EntityListConfig, EntityDetailConfig, EntityFormConfig 型の設定が存在する
- [ ] バリデーションスキーマに契約開始日 <= 契約終了日のrefinementが存在する

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 4: ページ実装

**対象ファイル**: `src/app/(auth)/partners/` 配下

**作業内容**:
1. 一覧ページ（EntityListTemplateに設定を渡すだけ）
2. 新規作成ページ（EntityFormTemplateに設定を渡すだけ）
3. 詳細ページ（EntityDetailTemplate + カスタムタブ）
4. 編集ページ（EntityFormTemplateに設定+IDを渡すだけ）
5. サイドバーナビゲーションに「代理店管理」リンクを追加

**確認チェック**:
- [ ] サイドバーの「代理店管理」をクリック → 代理店一覧が表示される（5件）
- [ ] テーブルの「代理店コード」ヘッダーをクリック → ソート切り替え
- [ ] 検索欄に「エナジー」と入力 → 1件にフィルタリング
- [ ] 階層フィルターで「2次代理店」選択 → 3件にフィルタリング
- [ ] ページネーションが動作する
- [ ] 「新規作成」ボタン → 代理店フォームが表示される
- [ ] 親代理店のドロップダウンに既存代理店が選択肢として表示される
- [ ] 必須フィールド未入力で「保存」→ バリデーションエラー表示
- [ ] 契約終了日 < 契約開始日で「保存」→ バリデーションエラー表示
- [ ] 正しく入力して「保存」→ 代理店が作成され、詳細画面に遷移
- [ ] 詳細画面で基本情報タブにデータが表示される（親代理店名含む）
- [ ] 「担当者」タブ → 担当者一覧が表示される
- [ ] 「編集」ボタン → 編集フォームに現在の値がプリセットされている
- [ ] 編集して「保存」→ 更新されて詳細画面に戻る
- [ ] 「削除」ボタン → 確認ダイアログ → 一覧に戻り、該当代理店が非表示
- [ ] `npm run type-check` → エラーゼロ
- [ ] `npm run build` → ビルド成功

**ゲート**: 上記の全項目が完了するまで次のStepに進まない。

---

### Step 5: 代理店担当者 + 事業リンク + 階層構造カスタムタブ

**対象ファイル**: `src/components/features/partner/` 配下

**作業内容**:
1. PartnerContactsTab コンポーネント
2. PartnerContactFormModal コンポーネント
3. PartnerBusinessLinksTab コンポーネント
4. PartnerBusinessLinkFormModal コンポーネント（手数料率・事業内階層の入力フォーム）
5. PartnerHierarchyTab コンポーネント（ツリー表示）

**確認チェック**:
- [ ] 担当者タブで「担当者を追加」→ モーダルフォーム表示（事業選択なし）
- [ ] 担当者を追加 → 一覧に追加表示される
- [ ] 担当者の編集 → モーダルで編集、保存後に反映
- [ ] 担当者の削除 → 確認後に削除
- [ ] 主担当の切り替え → 既存の主担当が自動解除される（代理店全体で1名）
- [ ] 事業リンクタブで「事業を紐付け」→ 未紐付けの事業が選択可能
- [ ] 事業リンク追加時に手数料率・事業内階層を入力できる
- [ ] 事業リンクの追加 → 一覧に手数料率・事業内階層が表示される
- [ ] 事業リンクの編集 → 手数料率・事業内階層・カスタムデータを変更可能
- [ ] 階層構造タブ → 親代理店→当該代理店→子代理店のツリーが表示される
- [ ] ツリーのノードクリック → 該当代理店の詳細ページへ遷移
- [ ] `npm run type-check` → エラーゼロ

**ゲート**: 上記の全項目が完了なら代理店マスタ機能の実装完了。
