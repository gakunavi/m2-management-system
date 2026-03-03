# Phase 1: 顧客マスタ詳細設計書（実装者向け）

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
7. [顧客担当者管理](#7-顧客担当者管理)
8. [顧客×事業リンク](#8-顧客事業リンク)
9. [ビジネスロジック](#9-ビジネスロジック)
10. [実装チェックリスト](#10-実装チェックリスト)

---

## 1. 実装概要

### 1.1 機能スコープ

| 機能 | 説明 |
|------|------|
| 顧客一覧 | 検索・フィルター・ソート・ページネーション付き一覧表示 |
| 顧客新規作成 | フォームによる顧客情報登録 |
| 顧客詳細 | タブ付き詳細画面（基本情報・担当者・事業リンク・関連案件） |
| 顧客編集 | 楽観的ロック付き更新 |
| 顧客論理削除 | `customer_is_active = false` による無効化 |
| 顧客復元 | 無効化された顧客の復元 |
| 顧客担当者CRUD | 顧客に紐づく担当者の追加・編集・削除 |
| 顧客×事業リンク | 顧客と事業の紐付け管理 |
| 顧客コード自動採番 | `CST-0001` 形式のコード自動生成 |

### 1.2 関連テーブル

```
customers（顧客マスタ）
├── customer_contacts（顧客担当者）
│   └── customer_contact_business_links（担当者×事業リンク）
├── customer_business_links（顧客×事業リンク）
└── projects（案件）※ Phase 2で実装、Phase 1では関連タブにプレースホルダー表示
```

### 1.3 ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/
│   │   └── customers/
│   │       ├── page.tsx                 # 顧客一覧
│   │       ├── new/
│   │       │   └── page.tsx             # 顧客新規作成
│   │       └── [id]/
│   │           ├── page.tsx             # 顧客詳細
│   │           └── edit/
│   │               └── page.tsx         # 顧客編集
│   └── api/v1/
│       └── customers/
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
│       └── customer.ts                  # 顧客設定オブジェクト
└── lib/
    └── validations/
        └── customer.ts                  # 顧客バリデーションスキーマ
```

---

## 2. Prismaスキーマ

### 2.1 Customer モデル

```prisma
model Customer {
  id                      Int       @id @default(autoincrement())
  customerCode            String    @unique @map("customer_code") @db.VarChar(20)
  customerName            String    @map("customer_name") @db.VarChar(200)
  customerSalutation      String?   @map("customer_salutation") @db.VarChar(100)
  customerType            String    @default("未設定") @map("customer_type") @db.VarChar(20)
  customerPostalCode      String?   @map("customer_postal_code") @db.VarChar(10)
  customerAddress         String?   @map("customer_address")
  customerPhone           String?   @map("customer_phone") @db.VarChar(20)
  customerFax             String?   @map("customer_fax") @db.VarChar(20)
  customerEmail           String?   @map("customer_email") @db.VarChar(255)
  customerWebsite         String?   @map("customer_website") @db.VarChar(500)
  industryId              Int?      @map("industry_id")
  industry                Industry? @relation(fields: [industryId], references: [id])
  customerCorporateNumber String?   @map("customer_corporate_number") @db.VarChar(13)
  customerInvoiceNumber   String?   @map("customer_invoice_number") @db.VarChar(14)
  customerCapital         BigInt?   @map("customer_capital")
  customerEstablishedDate DateTime? @map("customer_established_date") @db.Date
  customerFolderUrl       String?   @map("customer_folder_url") @db.VarChar(500)
  customerNotes           String?   @map("customer_notes")
  customerIsActive        Boolean   @default(true) @map("customer_is_active")
  version                 Int       @default(1)

  createdAt               DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt               DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  createdBy               Int?      @map("created_by")
  updatedBy               Int?      @map("updated_by")

  // リレーション
  contacts                CustomerContact[]
  businessLinks           CustomerBusinessLink[]
  creator                 User?     @relation("CustomerCreator", fields: [createdBy], references: [id])
  updater                 User?     @relation("CustomerUpdater", fields: [updatedBy], references: [id])

  @@index([customerCode, customerIsActive], map: "idx_customers_code_active")
  @@index([customerName], map: "idx_customers_name")
  @@index([industryId], map: "idx_customers_industry_id")
  @@index([customerType], map: "idx_customers_type")
  @@index([createdAt], map: "idx_customers_created_at")
  @@index([customerIsActive, updatedAt], map: "idx_customers_active_updated")
  @@map("customers")
}
```

#### 推奨インデックス設計

| インデックス | 用途 | クエリパターン |
|---|---|---|
| `idx_customers_code_active` | 一覧表示・コード検索 | `WHERE customer_is_active = true ORDER BY customer_code` |
| `idx_customers_name` | 顧客名検索（LIKE前方一致） | `WHERE customer_name LIKE '株式会社%'` |
| `idx_customers_industry` | 業種フィルター | `WHERE customer_industry = '製造業'` |
| `idx_customers_type` | 種別フィルター | `WHERE customer_type = '法人'` |
| `idx_customers_created_at` | 作成日ソート | `ORDER BY created_at DESC` |
| `idx_customers_active_updated` | アクティブ顧客の更新日ソート | `WHERE customer_is_active = true ORDER BY updated_at DESC` |

> **注意**: 部分一致検索（`%keyword%`）が必要な場合は、PostgreSQLの`pg_trgm`拡張とGINインデックスの導入を検討する。

### 2.2 CustomerContact モデル

```prisma
model CustomerContact {
  id                          Int      @id @default(autoincrement())
  customerId                  Int      @map("customer_id")
  contactName                 String   @map("contact_name") @db.VarChar(100)
  contactDepartment           String?  @map("contact_department") @db.VarChar(100)
  contactPosition             String?  @map("contact_position") @db.VarChar(100)
  contactIsRepresentative     Boolean  @default(false) @map("contact_is_representative")
  contactPhone                String?  @map("contact_phone") @db.VarChar(20)
  contactFax                  String?  @map("contact_fax") @db.VarChar(20)
  contactEmail                String?  @map("contact_email") @db.VarChar(255)
  contactBusinessCardFrontUrl String?  @map("contact_business_card_front_url") @db.VarChar(500)
  contactBusinessCardBackUrl  String?  @map("contact_business_card_back_url") @db.VarChar(500)
  contactIsPrimary            Boolean  @default(false) @map("contact_is_primary")
  contactSortOrder            Int      @default(0) @map("contact_sort_order")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // リレーション
  customer      Customer                    @relation(fields: [customerId], references: [id], onDelete: Cascade)
  businessLinks CustomerContactBusinessLink[]

  @@index([customerId])
  @@map("customer_contacts")
}
```

### 2.3 CustomerContactBusinessLink モデル（担当者×事業リンク）

```prisma
model CustomerContactBusinessLink {
  id        Int @id @default(autoincrement())
  contactId Int @map("contact_id")
  businessId Int @map("business_id")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  // リレーション
  contact  CustomerContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  business Business        @relation(fields: [businessId], references: [id])

  @@unique([contactId, businessId])
  @@index([businessId], map: "idx_contact_business_links_business")
  @@map("customer_contact_business_links")
}
```

**担当者と事業の紐付け:**
- 1担当者が複数事業を担当可能（多対多の中間テーブル方式）
- 代表者は `contactIsRepresentative = true` で識別（代表者と担当者を同一テーブルで管理）
- 名刺画像は表・裏のURL（画像ファイルのみ）を担当者レコードに格納

### 2.4 CustomerBusinessLink モデル

```prisma
model CustomerBusinessLink {
  id             Int       @id @default(autoincrement())
  customerId     Int       @map("customer_id")
  businessId     Int       @map("business_id")
  linkStatus     String    @default("active") @map("link_status") @db.VarChar(20)
  linkCustomData Json      @default("{}") @map("link_custom_data") @db.JsonB

  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // リレーション
  customer       Customer  @relation(fields: [customerId], references: [id])
  business       Business  @relation(fields: [businessId], references: [id])

  @@unique([customerId, businessId])
  @@map("customer_business_links")
}
```

---

## 3. シードデータ

### 3.1 顧客マスタ

```typescript
const customers = [
  {
    customerCode: "CST-0001",
    customerName: "株式会社サンプルテック",
    customerSalutation: "サンプルテック",
    customerType: "法人",
    customerPostalCode: "100-0001",
    customerAddress: "東京都千代田区千代田1-1-1",
    customerPhone: "03-1234-5678",
    customerFax: "03-1234-5679",
    customerEmail: "info@sample-tech.co.jp",
    industryId: 3, // 製造業
    customerCorporateNumber: "1234567890123",
    customerInvoiceNumber: "T1234567890123",
    customerCapital: 50000000n,
    customerEstablishedDate: new Date("2000-04-01"),
    customerFolderUrl: "https://drive.google.com/drive/folders/xxx",
  },
  {
    customerCode: "CST-0002",
    customerName: "合同会社グリーンファクトリー",
    customerSalutation: "グリーンF",
    customerType: "法人",
    customerPostalCode: "530-0001",
    customerAddress: "大阪府大阪市北区梅田1-2-3",
    customerPhone: "06-9876-5432",
    customerEmail: "contact@green-factory.jp",
    industryId: 3, // 製造業
    customerCapital: 30000000n,
    customerEstablishedDate: new Date("2010-08-15"),
  },
  {
    customerCode: "CST-0003",
    customerName: "有限会社ブルーオーシャン",
    customerSalutation: "ブルーオーシャン",
    customerType: "法人",
    customerPostalCode: "460-0008",
    customerAddress: "愛知県名古屋市中区栄3-4-5",
    customerPhone: "052-1111-2222",
    customerEmail: "info@blue-ocean.co.jp",
    industryId: 7, // 食品加工
    customerCapital: 10000000n,
  },
  {
    customerCode: "CST-0004",
    customerName: "株式会社テクノソリューション",
    customerSalutation: "テクノソル",
    customerType: "法人",
    customerPostalCode: "812-0011",
    customerAddress: "福岡県福岡市博多区博多駅前2-5-6",
    customerPhone: "092-3333-4444",
    customerEmail: "sales@techno-sol.co.jp",
    industryId: 1, // IT・ソフトウェア
    customerCorporateNumber: "9876543210123",
    customerInvoiceNumber: "T9876543210123",
    customerCapital: 100000000n,
    customerEstablishedDate: new Date("1995-01-10"),
  },
  {
    customerCode: "CST-0005",
    customerName: "田中商店",
    customerSalutation: "田中商店",
    customerType: "個人事業主",
    customerPostalCode: "980-0811",
    customerAddress: "宮城県仙台市青葉区一番町1-7-8",
    customerPhone: "022-5555-6666",
    customerEmail: "info@tanaka-store.jp",
    industryId: 6, // サービス業
    customerCapital: 5000000n,
  },
];
```

### 3.2 顧客担当者

```typescript
const customerContacts = [
  // CST-0001: 株式会社サンプルテック
  {
    customerId: 1, // CST-0001
    contactName: "山田太郎",
    contactDepartment: "代表取締役",
    contactPosition: "代表取締役社長",
    contactIsRepresentative: true,
    contactPhone: "03-1234-5678",
    contactEmail: "yamada@sample-tech.co.jp",
    contactBusinessCardFrontUrl: null,
    contactBusinessCardBackUrl: null,
    contactIsPrimary: true,
    contactSortOrder: 0,
  },
  {
    customerId: 1, // CST-0001
    contactName: "中村浩二",
    contactDepartment: "設備部",
    contactPosition: "課長",
    contactIsRepresentative: false,
    contactPhone: "03-1234-5679",
    contactFax: "03-1234-5680",
    contactEmail: "nakamura@sample-tech.co.jp",
    contactIsPrimary: false,
    contactSortOrder: 1,
  },
  // CST-0002: 合同会社グリーンファクトリー
  {
    customerId: 2, // CST-0002
    contactName: "佐藤花子",
    contactDepartment: "経営企画室",
    contactPosition: "室長",
    contactIsRepresentative: true,
    contactPhone: "06-9876-5433",
    contactEmail: "sato@green-factory.jp",
    contactIsPrimary: true,
    contactSortOrder: 0,
  },
];
```

### 3.2.1 担当者×事業リンク

```typescript
const customerContactBusinessLinks = [
  // 中村浩二（CST-0001）→ 事業A, 事業B
  { contactId: 2, businessId: 1 }, // 中村浩二 × 事業A
  { contactId: 2, businessId: 2 }, // 中村浩二 × 事業B
  // 佐藤花子（CST-0002）→ 事業A
  { contactId: 3, businessId: 1 }, // 佐藤花子 × 事業A
];
```

### 3.3 顧客×事業リンク

```typescript
const customerBusinessLinks = [
  { customerId: 1, businessId: 1, linkStatus: "active" }, // CST-0001 × MOAG事業
  { customerId: 1, businessId: 2, linkStatus: "active" }, // CST-0001 × サービスA事業
  { customerId: 2, businessId: 1, linkStatus: "active" }, // CST-0002 × MOAG事業
  { customerId: 3, businessId: 1, linkStatus: "active" }, // CST-0003 × MOAG事業
  { customerId: 4, businessId: 2, linkStatus: "active" }, // CST-0004 × サービスA事業
];
```

---

## 4. 設定オブジェクト

### 4.1 顧客一覧設定（customerListConfig）

> **スプレッドシートライク・インライン編集テーブル**: 顧客一覧は全フィールドを列として表示し、セル単位でのインライン編集に対応する。
> 自動生成フィールド（顧客コード・作成日時・更新日時）のみ読み取り専用。
> `inlineEditable: true` を指定することで `SpreadsheetTable` コンポーネントが使用される。
> 列の表示/非表示・並び順・幅はユーザーごとにDB保存される（`UserTablePreference`テーブル）。

```typescript
// config/entities/customer.ts
import { EntityListConfig } from "@/types/config";

const CUSTOMER_TYPE_OPTIONS = [
  { value: "法人", label: "法人" },
  { value: "個人事業主", label: "個人事業主" },
  { value: "個人", label: "個人" },
  { value: "確認中", label: "確認中" },
  { value: "未設定", label: "未設定" },
];

export const customerListConfig: EntityListConfig = {
  entityType: "customer",
  apiEndpoint: "/customers",
  title: "顧客一覧",
  inlineEditable: true,
  patchEndpoint: (id) => `/customers/${id}`,

  columns: [
    // ===== 読み取り専用（自動生成）=====
    { key: "customerCode", label: "顧客コード", width: 120, sortable: true, locked: true },

    // ===== 編集可能フィールド =====
    {
      key: "customerName", label: "顧客名", minWidth: 200, sortable: true, locked: true,
      edit: {
        type: "text", placeholder: "例：株式会社〇〇",
        validate: (v) => typeof v === "string" && v.trim().length > 0
          ? { success: true } : { success: false, error: "必須" },
      },
    },
    { key: "customerSalutation", label: "呼称", width: 150,
      edit: { type: "text", placeholder: "例：テクノ" } },
    { key: "customerType", label: "種別", width: 110,
      edit: { type: "select", options: CUSTOMER_TYPE_OPTIONS } },
    { key: "customerPostalCode", label: "郵便番号", width: 110, defaultVisible: false,
      edit: { type: "text", placeholder: "000-0000" } },
    { key: "customerAddress", label: "住所", minWidth: 200, defaultVisible: false,
      edit: { type: "text", placeholder: "都道府県・市区町村・番地" } },
    { key: "customerPhone", label: "電話番号", width: 140,
      edit: { type: "phone", placeholder: "03-0000-0000" } },
    { key: "customerFax", label: "FAX", width: 140, defaultVisible: false,
      edit: { type: "phone", placeholder: "03-0000-0000" } },
    { key: "customerEmail", label: "メール", width: 200, defaultVisible: false,
      edit: { type: "email", placeholder: "info@example.com" } },
    { key: "customerWebsite", label: "Webサイト", width: 200, defaultVisible: false,
      edit: { type: "url", placeholder: "https://example.com" } },
    { key: "industryId", label: "業種", width: 150, sortable: false,
      render: (_value, row) => row.industry?.industryName ?? "-" },
    { key: "customerCorporateNumber", label: "法人番号", width: 150, defaultVisible: false,
      edit: { type: "text", placeholder: "13桁の数字" } },
    { key: "customerInvoiceNumber", label: "インボイス番号", width: 160, defaultVisible: false,
      edit: { type: "text", placeholder: "T + 13桁の数字" } },
    { key: "customerCapital", label: "資本金", width: 140, align: "right", defaultVisible: false,
      edit: { type: "number", placeholder: "0" },
      render: (v) => (v != null ? `${Number(v).toLocaleString()}円` : "-") },
    { key: "customerEstablishedDate", label: "設立日", width: 130, defaultVisible: false,
      edit: { type: "date" } },
    { key: "customerFolderUrl", label: "フォルダURL", width: 200, defaultVisible: false,
      edit: { type: "url", placeholder: "https://drive.example.com/..." } },
    { key: "customerNotes", label: "メモ", width: 200, defaultVisible: false,
      edit: { type: "textarea" } },
    { key: "customerIsActive", label: "ステータス", width: 90, align: "center",
      edit: { type: "checkbox" },
      render: (value) => (value ? "有効" : "無効") },

    // ===== 読み取り専用（自動）=====
    { key: "updatedAt", label: "更新日時", width: 150, sortable: true },
    { key: "createdAt", label: "作成日時", width: 150, sortable: true, defaultVisible: false },
  ],

  search: {
    placeholder: "顧客名・顧客コードで検索...",
    fields: ["customerName", "customerCode"],
    debounceMs: 300,
  },

  filters: [
    {
      key: "customerType", label: "種別", type: "select",
      options: CUSTOMER_TYPE_OPTIONS,
    },
    {
      key: "industryId", label: "業種", type: "select",
      optionsEndpoint: "/customers/filter-options",
    },
    {
      key: "isActive", label: "状態", type: "select",
      options: [
        { value: "true", label: "有効" },
        { value: "false", label: "無効（削除済み）" },
      ],
    },
  ],

  defaultSort: { field: "customerCode", direction: "asc" },

  tableSettings: {
    persistKey: "customer-list",   // ← テーブルビューの tableKey としても使用
    defaultPageSize: 25,
    defaultDensity: "normal",
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },

  detailPath: (id) => `/customers/${id}`,
  createPath: "/customers/new",
};
```

**テーブルビュー機能（Phase 1.5 で実装予定）:**

ユーザーは顧客一覧テーブルの表示状態（表示列・ソート・絞り込み・ページサイズ）を名前付きで保存し、目的に応じて切り替えて使える。

想定されるビュー例:
- 「営業用」: 顧客名・電話番号・業種・メモのみ表示、業種でフィルタ
- 「経理用」: 法人番号・インボイス番号・資本金を表示
- 「全件確認」: 全列表示、ソートなし

`tableSettings.persistKey = "customer-list"` が `user_table_views.table_key` となり、代理店一覧（"partner-list"）など他テーブルとビューが分離される。詳細は `02_COMPONENT_DESIGN.md` の `useTableViews` / `ViewBar` を参照。

**インライン編集フロー:**
1. ユーザーがセルをクリック → 編集モードに遷移
2. 値を変更し、blur / Enter → `PATCH /api/v1/customers/:id` に `{ [fieldKey]: newValue, version: currentVersion }` を送信
3. 成功 → サーバーレスポンスでキャッシュ置換（新 version 取得）
4. 409 Conflict → トースト通知 + リスト再取得
5. Escape → 編集キャンセル（値を元に戻す）
6. checkbox 型はクリックで即トグル（編集モードなし）

### 4.2 顧客詳細設定（customerDetailConfig）

```typescript
import { EntityDetailConfig } from "@/types/config";

export const customerDetailConfig: EntityDetailConfig = {
  entityType: "customer",
  apiEndpoint: "/api/v1/customers",
  title: "顧客詳細",

  editPath: (id) => `/customers/${id}/edit`,
  listPath: "/customers",

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
              { key: "customerCode", label: "顧客コード" },
              { key: "customerName", label: "顧客名" },
              { key: "customerSalutation", label: "呼称" },
              { key: "customerType", label: "種別" },
              { key: "industryId", label: "業種",
                render: (_value, data) => data.industry?.industryName ?? "-" },
              { key: "customerCorporateNumber", label: "法人番号" },
              { key: "customerInvoiceNumber", label: "インボイス番号" },
              { key: "customerCapital", label: "資本金", format: "currency" },
              { key: "customerEstablishedDate", label: "設立年月日", format: "date" },
            ],
          },
          {
            title: "連絡先",
            columns: 2,
            fields: [
              { key: "customerPostalCode", label: "郵便番号" },
              { key: "customerAddress", label: "住所", colSpan: 2 },
              { key: "customerPhone", label: "電話番号" },
              { key: "customerFax", label: "FAX番号" },
              { key: "customerEmail", label: "メールアドレス" },
              { key: "customerWebsite", label: "Webサイト", format: "link" },
            ],
          },
          {
            title: "その他",
            columns: 2,
            fields: [
              { key: "customerFolderUrl", label: "顧客フォルダURL", format: "link" },
              { key: "customerNotes", label: "備考", format: "text", colSpan: 2 },
            ],
          },
        ],
      } as InfoTabConfig,
    },
    {
      key: "contacts",
      label: "担当者",
      component: "custom",
      // CustomerContactsTab コンポーネントを使用（後述）
    },
    {
      key: "businessLinks",
      label: "事業リンク",
      component: "custom",
      // CustomerBusinessLinksTab コンポーネントを使用（後述）
    },
    {
      key: "projects",
      label: "関連案件",
      component: "related",
      config: {
        apiEndpoint: "/api/v1/projects",
        filterKey: "customerId",
        columns: [
          { key: "projectNo", label: "案件番号", width: 120 },
          { key: "projectName", label: "案件名", width: 200 },
          { key: "projectSalesStatus", label: "ステータス", width: 100 },
          { key: "projectAmount", label: "金額", width: 100, align: "right" },
        ],
        emptyMessage: "この顧客に紐づく案件はありません",
        detailPath: (id) => `/projects/${id}`,
      } as RelatedTabConfig,
    },
  ],

  deleteConfig: {
    confirm: {
      title: "顧客の削除",
      message: "この顧客を削除（無効化）しますか？紐づく担当者・案件は保持されます。",
    },
    apiEndpoint: "/api/v1/customers",
  },
};
```

### 4.3 顧客フォーム設定（customerFormConfig）

```typescript
import { EntityFormConfig } from "@/types/config";
import { customerCreateSchema, customerUpdateSchema } from "@/lib/validations/customer";

export const customerFormConfig: EntityFormConfig = {
  entityType: "customer",
  apiEndpoint: "/api/v1/customers",
  title: { create: "顧客新規登録", edit: "顧客編集" },
  redirectAfterSave: (id) => `/customers/${id}`,

  sections: [
    {
      title: "基本情報",
      columns: 2,
      fields: [
        {
          key: "customerName",
          label: "顧客名（会社名）",
          type: "text",
          required: true,
          placeholder: "例: 株式会社サンプルテック",
        },
        {
          key: "customerSalutation",
          label: "呼称",
          type: "text",
          placeholder: "例: サンプルテック",
        },
        {
          key: "customerType",
          label: "種別",
          type: "select",
          required: true,
          options: [
            { value: "法人", label: "法人" },
            { value: "個人事業主", label: "個人事業主" },
            { value: "個人", label: "個人" },
            { value: "確認中", label: "確認中" },
            { value: "未設定", label: "未設定" },
          ],
        },
        {
          key: "industryId",
          label: "業種",
          type: "master-select",
          masterSelect: {
            endpoint: "/industries",
            labelField: "industryName",
            modalTitle: "業種管理",
          },
        },
        {
          key: "customerCorporateNumber",
          label: "法人番号（13桁）",
          type: "text",
          placeholder: "例: 1234567890123",
        },
        {
          key: "customerInvoiceNumber",
          label: "インボイス番号",
          type: "text",
          placeholder: "例: T1234567890123",
        },
        {
          key: "customerCapital",
          label: "資本金（円）",
          type: "number",
          placeholder: "例: 50000000",
        },
        {
          key: "customerEstablishedDate",
          label: "設立年月日",
          type: "date",
          placeholder: "設立年月日を選択",
        },
      ],
    },
    {
      title: "連絡先",
      columns: 2,
      fields: [
        {
          key: "customerPostalCode",
          label: "郵便番号",
          type: "text",
          placeholder: "例: 100-0001",
        },
        {
          key: "customerAddress",
          label: "住所",
          type: "text",
          colSpan: 2,
          placeholder: "例: 東京都千代田区千代田1-1-1",
        },
        {
          key: "customerPhone",
          label: "電話番号",
          type: "text",
          placeholder: "例: 03-1234-5678",
        },
        {
          key: "customerFax",
          label: "FAX番号",
          type: "text",
          placeholder: "例: 03-1234-5679",
        },
        {
          key: "customerEmail",
          label: "メールアドレス",
          type: "email",
          placeholder: "例: info@example.co.jp",
        },
        {
          key: "customerWebsite",
          label: "Webサイト",
          type: "url",
          placeholder: "例: https://example.co.jp",
        },
      ],
    },
    {
      title: "その他",
      columns: 2,
      fields: [
        {
          key: "customerFolderUrl",
          label: "顧客フォルダURL",
          type: "url",
          placeholder: "例: https://drive.google.com/drive/folders/xxx",
        },
        {
          key: "customerNotes",
          label: "備考",
          type: "textarea",
          colSpan: 2,
          placeholder: "備考を入力",
        },
      ],
    },
  ],

  validationSchema: {
    create: customerCreateSchema,
    edit: customerUpdateSchema,
  },
};
```

---

## 5. ページ実装

### 5.1 顧客一覧ページ

```typescript
// src/app/(auth)/customers/page.tsx
'use client';

import { Suspense } from 'react';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { customerListConfig } from '@/config/entities/customer';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function CustomersPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EntityListTemplate config={customerListConfig} />
    </Suspense>
  );
}
```

> **注意**: `'use client'` と `<Suspense>` の両方が必要。
> - `'use client'`: config オブジェクトに関数（`render`, `patchEndpoint`, `detailPath`, `validate`）が含まれるため、Server Component では使用不可
> - `<Suspense>`: `useEntityList` フック内で `useSearchParams()` を使用しており、Next.js 14 App Router では Suspense 境界が必須

### 5.2 顧客新規作成ページ

```typescript
// src/app/(auth)/customers/new/page.tsx
import { EntityFormTemplate } from "@/components/templates/entity-form-template";
import { customerFormConfig } from "@/config/entities/customer";

export default function CustomerCreatePage() {
  return <EntityFormTemplate config={customerFormConfig} />;
}
```

### 5.3 顧客詳細ページ

```typescript
// src/app/(auth)/customers/[id]/page.tsx
import { EntityDetailTemplate } from "@/components/templates/entity-detail-template";
import { customerDetailConfig } from "@/config/entities/customer";
import { CustomerContactsTab } from "@/components/features/customer/customer-contacts-tab";
import { CustomerBusinessLinksTab } from "@/components/features/customer/customer-business-links-tab";

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customTabs = {
    contacts: CustomerContactsTab,
    businessLinks: CustomerBusinessLinksTab,
  };

  return (
    <EntityDetailTemplate
      config={customerDetailConfig}
      id={params.id}
      customTabs={customTabs}
    />
  );
}
```

### 5.4 顧客編集ページ

```typescript
// src/app/(auth)/customers/[id]/edit/page.tsx
import { EntityFormTemplate } from "@/components/templates/entity-form-template";
import { customerFormConfig } from "@/config/entities/customer";

export default function CustomerEditPage({ params }: { params: { id: string } }) {
  return <EntityFormTemplate config={customerFormConfig} id={params.id} />;
}
```

---

## 6. バリデーション

### 6.1 Zodスキーマ

```typescript
// src/lib/validations/customer.ts
import { z } from "zod";

// 顧客種別の定数
const CUSTOMER_TYPES = ["法人", "個人事業主", "個人", "確認中", "未設定"] as const;

// 顧客新規作成スキーマ
export const customerCreateSchema = z.object({
  customerName: z
    .string()
    .min(1, "顧客名は必須です")
    .max(200, "顧客名は200文字以内で入力してください"),
  customerSalutation: z
    .string()
    .max(100, "呼称は100文字以内で入力してください")
    .optional()
    .or(z.literal("")),
  customerType: z
    .enum(CUSTOMER_TYPES, { errorMap: () => ({ message: "種別を選択してください" }) })
    .default("未設定"),
  customerPostalCode: z
    .string()
    .regex(/^\d{3}-?\d{4}$/, "郵便番号の形式が正しくありません（例: 100-0001）")
    .optional()
    .or(z.literal("")),
  customerAddress: z.string().optional().or(z.literal("")),
  customerPhone: z
    .string()
    .regex(/^[\d\-+()]+$/, "電話番号の形式が正しくありません")
    .optional()
    .or(z.literal("")),
  customerFax: z
    .string()
    .regex(/^[\d\-+()]+$/, "FAX番号の形式が正しくありません")
    .optional()
    .or(z.literal("")),
  customerEmail: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  customerWebsite: z
    .string()
    .url("URLの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  industryId: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),
  customerCorporateNumber: z
    .string()
    .regex(/^\d{13}$/, "法人番号は13桁の数字で入力してください")
    .optional()
    .or(z.literal("")),
  customerInvoiceNumber: z
    .string()
    .regex(/^T\d{13}$/, "インボイス番号はT+13桁の数字で入力してください（例: T1234567890123）")
    .optional()
    .or(z.literal("")),
  customerCapital: z
    .number()
    .min(0, "0以上の値を入力してください")
    .optional()
    .nullable(),
  customerEstablishedDate: z
    .string()
    .or(z.date())
    .optional()
    .nullable(),
  customerFolderUrl: z
    .string()
    .url("URLの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  customerNotes: z.string().optional().or(z.literal("")),
});

// 顧客更新スキーマ（version必須）
export const customerUpdateSchema = customerCreateSchema.extend({
  version: z.number().int("バージョンが不正です"),
});

// 顧客担当者スキーマ
export const customerContactSchema = z.object({
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
  contactIsRepresentative: z.boolean().default(false),
  contactPhone: z
    .string()
    .regex(/^[\d\-+()]+$/, "電話番号の形式が正しくありません")
    .optional()
    .or(z.literal("")),
  contactFax: z
    .string()
    .regex(/^[\d\-+()]+$/, "FAX番号の形式が正しくありません")
    .optional()
    .or(z.literal("")),
  contactEmail: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  contactBusinessCardFrontUrl: z
    .string()
    .url("URLの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  contactBusinessCardBackUrl: z
    .string()
    .url("URLの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  contactIsPrimary: z.boolean().default(false),
  businessIds: z
    .array(z.number().int())
    .optional()
    .default([]),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerContactInput = z.infer<typeof customerContactSchema>;
```

---

## 7. 顧客担当者管理

### 7.1 UI仕様

顧客詳細画面の「担当者」タブにインラインでCRUD機能を提供する。

**表示:**
- テーブル形式で担当者一覧を表示
- 列: 担当者名 / 部署 / 役職 / 代表者 / 電話番号 / FAX / メール / 担当事業 / 名刺 / 主担当
- 代表者にはバッジ表示（`contactIsRepresentative = true`）
- 主担当者にはバッジ表示（`contactIsPrimary = true`）
- 担当事業は `CustomerContactBusinessLink` 経由で紐付いた事業名をカンマ区切りで表示
- 名刺画像がある場合はサムネイルアイコンを表示（クリックで拡大表示）

**操作:**
- 「担当者を追加」ボタン → モーダルフォームを表示
- 行の編集アイコン → モーダルフォームで編集
- 行の削除アイコン → 確認ダイアログ後に物理削除（紐付く事業リンクも連鎖削除）

**モーダルフォームのフィールド:**
- 担当者名（必須）/ 部署 / 役職
- 代表者フラグ（チェックボックス）
- 電話番号 / FAX番号 / メールアドレス
- 名刺画像URL（表）/ 名刺画像URL（裏）
- 担当事業（複数選択チェックボックス。顧客に紐付いている事業一覧から選択）
- 主担当フラグ（チェックボックス）

**主担当制約:**
- 顧客全体で主担当は1名まで
- 主担当を設定すると、既存の主担当は自動解除される

### 7.2 コンポーネント

```typescript
// src/components/features/customer/customer-contacts-tab.tsx
"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { CustomerContactFormModal } from "./customer-contact-form-modal";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Props = {
  entityId: number;
};

export function CustomerContactsTab({ entityId }: Props) {
  // 担当者一覧取得
  // モーダル表示制御
  // CRUD操作
  // 主担当の排他制御
}
```

---

## 8. 顧客×事業リンク

### 8.1 UI仕様

顧客詳細画面の「事業リンク」タブで管理する。

**表示:**
- テーブル形式で紐づき事業一覧を表示
- 列: 事業名 / ステータス / カスタムデータ（事業固有フィールド）/ 開始日

**操作:**
- 「事業を紐付け」ボタン → 未紐付けの事業をドロップダウンから選択
- ステータス変更（active / inactive）
- 紐付け解除（物理削除）

**カスタムデータ:**
- `business_config.customerFields` に定義されたフィールドを動的フォームで表示
- 事業ごとに異なるフィールド構成を持つ

### 8.2 コンポーネント

```typescript
// src/components/features/customer/customer-business-links-tab.tsx
"use client";

import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/hooks/use-business";

type Props = {
  entityId: number;
};

export function CustomerBusinessLinksTab({ entityId }: Props) {
  // 事業リンク一覧取得
  // リンク追加/削除
  // カスタムデータ編集
}
```

---

## 9. ビジネスロジック

### 9.1 顧客コード自動採番

```typescript
/**
 * 顧客コード自動採番
 * 形式: CST-{4桁連番} （例: CST-0001, CST-0002）
 *
 * 実装方針:
 * 1. customers テーブルから customer_code の最大値を取得
 * 2. プレフィックス "CST-" を除去し、数値部分を +1
 * 3. 4桁ゼロパディング
 * 4. UNIQUE制約で競合時はexponential backoffでリトライ（最大5回）
 * 5. 5回失敗時は503 CODE_GENERATION_FAILED
 */
async function generateCustomerCode(prisma: PrismaClient): Promise<string> {
  const PREFIX = "CST-";
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 50; // exponential backoff: 50, 100, 200, 400, 800ms

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const lastCustomer = await prisma.customer.findFirst({
      where: { customerCode: { startsWith: PREFIX } },
      orderBy: { customerCode: "desc" },
      select: { customerCode: true },
    });

    let nextNumber = 1;
    if (lastCustomer) {
      const numPart = parseInt(lastCustomer.customerCode.replace(PREFIX, ""), 10);
      nextNumber = numPart + 1;
    }

    const code = `${PREFIX}${String(nextNumber).padStart(4, "0")}`;

    try {
      const exists = await prisma.customer.findUnique({
        where: { customerCode: code },
      });
      if (!exists) return code;
    } catch {
      // UNIQUE制約違反の場合はリトライ
    }
  }

  throw new ApiError(503, "CODE_GENERATION_FAILED", "顧客コードの採番に失敗しました。しばらく待ってから再試行してください。");
}
```

**リトライ仕様**:

| 試行回数 | 待機時間 | 累計待機 |
|---|---|---|
| 1回目 | 0ms | 0ms |
| 2回目 | 50ms | 50ms |
| 3回目 | 100ms | 150ms |
| 4回目 | 200ms | 350ms |
| 5回目 | 400ms | 750ms |
| 全失敗 | - | 503 `CODE_GENERATION_FAILED` |

### 9.2 楽観的ロック

Phase 0で実装済みのPrisma middlewareを利用する。顧客更新時のフローは以下の通り:

```
1. クライアント → PUT /api/v1/customers/:id { ...data, version: 3 }
2. サーバー → Prisma middleware が version チェック
3. version 一致 → 更新実行、version を 4 にインクリメント
4. version 不一致 → 409 VERSION_CONFLICT レスポンス
5. クライアント → ConflictErrorModal 表示
6. ユーザー → 「最新データを読み込む」or「キャンセル」
```

#### 競合解決戦略: Server Wins（Phase 1）

Phase 1では「**Server Wins**」戦略を採用する。ユーザーの変更は破棄され、最新データでフォームをリセットする。

**409レスポンスの形式**:
```json
{
  "success": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "他のユーザーによって更新されています",
    "details": {
      "currentVersion": 4,
      "submittedVersion": 3,
      "updatedBy": "佐藤花子",
      "updatedAt": "2026-02-21T10:30:00Z"
    }
  }
}
```

**クライアント側の処理**:
```typescript
// useEntityForm 内の送信エラーハンドリング
if (error instanceof ApiClientError && error.status === 409) {
  openConflictModal({
    title: "更新の競合が発生しました",
    message: `${error.details.updatedBy}さんが${formatDate(error.details.updatedAt)}にこのデータを更新しました。`,
    actions: [
      {
        label: "最新データを読み込む",
        variant: "primary",
        action: async () => {
          const latest = await apiClient.getById(config.apiEndpoint, id);
          resetForm(latest); // フォームを最新データでリセット
          toast({ message: "最新データを読み込みました", type: "info" });
        },
      },
      {
        label: "キャンセル",
        variant: "secondary",
        action: () => closeModal(),
      },
    ],
  });
}
```

**フロー図**:
```
ユーザーA: GET /customers/1 (version=3)
                                    ユーザーB: GET /customers/1 (version=3)
                                    ユーザーB: PUT /customers/1 {version:3} → 200 (version=4)
ユーザーA: PUT /customers/1 {version:3}
→ 409 VERSION_CONFLICT {currentVersion:4, submittedVersion:3, updatedBy:"佐藤花子"}
→ クライアント: ConflictErrorModal表示
→ ユーザーA: 「最新データを読み込む」クリック
→ GET /customers/1 → 200 (version=4)
→ フォームを最新データでリセット
```

**実装チェック項目**:
- [ ] 編集フォームでversionフィールドをhiddenで保持している
- [ ] PUT送信時にversionをリクエストボディに含めている
- [ ] 409レスポンス時にConflictErrorModalが表示される
- [ ] モーダルに「誰が」「いつ」更新したかが表示される
- [ ] 「最新データを読み込む」クリックでフォームが最新データにリセットされる
- [ ] 「キャンセル」クリックでモーダルが閉じ、編集画面に戻る（ユーザーの入力は保持）

### 9.3 論理削除

```
DELETE /api/v1/customers/:id
→ customer_is_active = false に更新
→ 子データ（contacts, business_links）は変更しない
→ 204 No Content レスポンス

PATCH /api/v1/customers/:id/restore
→ customer_is_active = true に復元
→ 200 OK レスポンス（復元後のデータ）
```

### 9.4 監査ログ

Phase 0で実装済みのPrisma middlewareにより、customersテーブルの INSERT/UPDATE/DELETE を自動記録する。

記録対象フィールド: 全フィールド（version, created_at, updated_at を除く）

---

## 10. 実装チェックリスト

### Step 1: Prismaスキーマ拡張

**対象ファイル**: `prisma/schema.prisma`, `prisma/seed.ts`

**作業内容**:
1. Customer, CustomerContact, CustomerBusinessLink モデルを追加
2. マイグレーション実行
3. シードデータ追加（顧客5件 + 担当者3件 + 事業リンク5件）

**確認チェック**:
- [ ] `npx prisma migrate dev --name add_customers` → マイグレーション成功
- [ ] `npx prisma db seed` → シードデータ投入成功
- [ ] `npx prisma studio` → customers テーブル: 5件、customer_contacts: 3件、customer_business_links: 5件
- [ ] `npm run type-check` → エラーゼロ

**🚫 ゲート**: 上記の全項目が ✅ になるまで次のStepに進まない。

---

### Step 2: API実装

**対象ファイル**: `src/app/api/v1/customers/` 配下

**作業内容**:
1. 顧客一覧API（GET /api/v1/customers） — 検索・フィルター・ソート・ページネーション
2. 顧客作成API（POST /api/v1/customers） — バリデーション + 自動採番
3. 顧客詳細API（GET /api/v1/customers/:id）
4. 顧客更新API（PATCH /api/v1/customers/:id） — 楽観的ロック
5. 顧客論理削除API（DELETE /api/v1/customers/:id）
6. 顧客復元API（PATCH /api/v1/customers/:id/restore）
7. フィルター選択肢API（GET /api/v1/customers/filter-options）
8. 担当者CRUD API
9. 事業リンクCRUD API

**確認チェック**:
- [ ] `GET /api/v1/customers` → 5件のデータが返却される（ページネーション付き）
- [ ] `GET /api/v1/customers?search=サンプル` → 1件にフィルタリングされる
- [ ] `POST /api/v1/customers` → 顧客が作成され、customerCodeが "CST-0006" で自動採番される
- [ ] `POST /api/v1/customers` → customerName未指定時に400 VALIDATION_ERROR
- [ ] `PATCH /api/v1/customers/1` → version一致で更新成功
- [ ] `PATCH /api/v1/customers/1` → version不一致で409 CONFLICT
- [ ] `DELETE /api/v1/customers/1` → customer_is_active = false に更新
- [ ] `PATCH /api/v1/customers/1/restore` → customer_is_active = true に復元
- [ ] `GET /api/v1/customers/1/contacts` → 2件の担当者が返却される
- [ ] `npm run type-check` → エラーゼロ

**🚫 ゲート**: 上記の全項目が ✅ になるまで次のStepに進まない。

---

### Step 3: 設定オブジェクト + バリデーション

**対象ファイル**: `src/config/entities/customer.ts`, `src/lib/validations/customer.ts`

**作業内容**:
1. customerListConfig, customerDetailConfig, customerFormConfig の作成
2. Zodバリデーションスキーマの作成

**確認チェック**:
- [ ] `npm run type-check` → エラーゼロ
- [ ] customer.ts に EntityListConfig, EntityDetailConfig, EntityFormConfig 型の設定が存在する

**🚫 ゲート**: 上記の全項目が ✅ になるまで次のStepに進まない。

---

### Step 4: ページ実装

**対象ファイル**: `src/app/(auth)/customers/` 配下

**作業内容**:
1. 一覧ページ（EntityListTemplateに設定を渡すだけ）
2. 新規作成ページ（EntityFormTemplateに設定を渡すだけ）
3. 詳細ページ（EntityDetailTemplate + カスタムタブ）
4. 編集ページ（EntityFormTemplateに設定+IDを渡すだけ）
5. サイドバーナビゲーションに「顧客管理」リンクを追加

**確認チェック**:
- [ ] サイドバーの「顧客管理」をクリック → 顧客一覧が表示される（5件）
- [ ] テーブルの「顧客コード」ヘッダーをクリック → ソート切り替え
- [ ] 検索欄に「サンプル」と入力 → 1件にフィルタリング
- [ ] ページネーションが動作する
- [ ] 「新規作成」ボタン → 顧客フォームが表示される
- [ ] 必須フィールド未入力で「保存」→ バリデーションエラー表示
- [ ] 正しく入力して「保存」→ 顧客が作成され、詳細画面に遷移
- [ ] 詳細画面で基本情報タブにデータが表示される
- [ ] 「担当者」タブ → 担当者一覧が表示される
- [ ] 「編集」ボタン → 編集フォームに現在の値がプリセットされている
- [ ] 編集して「保存」→ 更新されて詳細画面に戻る
- [ ] 「削除」ボタン → 確認ダイアログ → 一覧に戻り、該当顧客が非表示
- [ ] `npm run type-check` → エラーゼロ
- [ ] `npm run build` → ビルド成功

**🚫 ゲート**: 上記の全項目が ✅ になるまで次のStepに進まない。

---

### Step 5: 顧客担当者 + 事業リンクカスタムタブ

**対象ファイル**: `src/components/features/customer/` 配下

**作業内容**:
1. CustomerContactsTab コンポーネント
2. CustomerContactFormModal コンポーネント
3. CustomerBusinessLinksTab コンポーネント

**確認チェック**:
- [ ] 担当者タブで「担当者を追加」→ モーダルフォーム表示
- [ ] 担当者を追加 → 一覧に追加表示される
- [ ] 担当者の編集 → モーダルで編集、保存後に反映
- [ ] 担当者の削除 → 確認後に削除
- [ ] 主担当の切り替え → 既存の主担当が自動解除される
- [ ] 事業リンクタブで「事業を紐付け」→ 未紐付けの事業が選択可能
- [ ] 事業リンクの追加 → 一覧に追加表示される
- [ ] `npm run type-check` → エラーゼロ

**🚫 ゲート**: 上記の全項目が ✅ なら顧客マスタ機能の実装完了。
