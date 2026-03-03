# Phase 0: 基盤設計 PRD

## 1. 概要

### 1.1 目的

Phase 0は、全フェーズの基盤となる技術インフラと共通コンポーネントを構築するフェーズである。

本フェーズでは、Next.js 14 (App Router) + Prisma + PostgreSQL + Docker Composeによるプロジェクト基盤を確立し、認証・認可、共通UIコンポーネント、共通フック、統一APIクライアント、エラーハンドリングの各基盤を完成させる。

Phase 0の成果物は、Phase 1以降で「設定ファイルを追加するだけで新しいエンティティ画面が動作する」ための土台となる。ここで構築する共通基盤の品質が、プロジェクト全体の開発効率と保守性を決定する。

### 1.2 完了条件

認証によるログインが動作し、空のエンティティ一覧・詳細・フォーム画面がテンプレートとダミー設定から正しく動作すること。

### 1.3 前提ドキュメント

本PRDは以下の設計書に基づく。

| ドキュメント | 参照内容 |
|---|---|
| [00_PROJECT_PRD.md](./00_PROJECT_PRD.md) | プロジェクト全体のゴール、ユーザー種別、技術スタック |
| [01_DATA_MODEL.md](./01_DATA_MODEL.md) | テーブル定義、命名規則 |
| [02_COMPONENT_DESIGN.md](./02_COMPONENT_DESIGN.md) | 共通コンポーネント設計、設定オブジェクト型定義 |

---

## 2. ユーザーストーリー

### US-001: 管理者ログインとサイドバーナビゲーション

**ユーザー**: 管理者（admin）
**ストーリー**: 管理者としてログインし、サイドバーから各画面に遷移できる

**詳細**:
- ログイン画面でメールアドレスとパスワードを入力してログインする
- ログイン成功後、サイドバー付きのメインレイアウトに遷移する
- サイドバーのナビゲーションリンクをクリックして、ダッシュボード、一覧画面などに遷移できる
- ヘッダーにユーザー名、通知ベルアイコン（プレースホルダー）、ログアウトボタンが表示される

**受け入れ基準**:
- [ ] ログイン画面でadminユーザーの認証情報を入力するとログインできる
- [ ] ログイン失敗時にエラーメッセージが表示される
- [ ] サイドバーに「ダッシュボード」リンクが表示される
- [ ] 未認証状態でアクセスするとログイン画面にリダイレクトされる
- [ ] ログアウトするとログイン画面に遷移する

### US-002: 事業切り替え

**ユーザー**: 管理者（admin）、担当者（staff）
**ストーリー**: 事業切り替えで選択した事業のデータのみ表示される

**詳細**:
- サイドバーの事業切り替え（BusinessSwitcher）で、所属する事業を選択できる
- 事業を切り替えると、現在選択中の事業名がサイドバーに表示される
- 選択した事業のコンテキストがアプリケーション全体で保持される

**受け入れ基準**:
- [ ] BusinessSwitcherに所属事業の一覧が表示される
- [ ] 事業を選択すると、選択中の事業名がサイドバーに反映される
- [ ] ページ遷移後も選択した事業が保持される
- [ ] adminユーザーには全事業が表示される
- [ ] staffには所属事業のみが表示される

**補足**: Phase 0では事業切り替えUIの動作まで。データフィルタリングの実装はPhase 1以降で行う。

### US-003: 代理店ポータルへの遷移

**ユーザー**: 代理店（partner_admin / partner_staff）
**ストーリー**: 代理店ユーザーとしてログインすると、閲覧のみのポータルに遷移する

**詳細**:
- partner_admin/partner_staffロールのユーザーでログインすると、代理店ポータル（`/portal`）に自動遷移する
- 代理店ポータルは管理画面とは異なる専用レイアウトで表示される
- 代理店ユーザー（partner_admin/partner_staff）が管理画面のURLに直接アクセスしても、ポータルにリダイレクトされる

**受け入れ基準**:
- [ ] partner_admin/partner_staffロールのユーザーでログインするとポータル画面に遷移する
- [ ] ポータル画面は閲覧専用のレイアウトで表示される
- [ ] 代理店ユーザー（partner_admin/partner_staff）が`/(auth)/`配下のURLにアクセスすると`/portal`にリダイレクトされる
- [ ] admin/staffが`/(partner)/`配下のURLにアクセスすると`/dashboard`にリダイレクトされる

### US-004: 設定オブジェクトによる一覧画面の追加（開発者向け）

**ユーザー**: 開発者
**ストーリー**: 共通テンプレートに設定オブジェクトを渡すだけで、新しい一覧画面を追加できる

**詳細**:
- `EntityListConfig`型の設定オブジェクトを定義する
- ページコンポーネントで`EntityListTemplate`に設定を渡すだけで、検索・フィルター・ソート・ページネーション付きの一覧画面が動作する
- 同様に`EntityDetailTemplate`、`EntityFormTemplate`も設定オブジェクトのみで動作する

**受け入れ基準**:
- [ ] ダミーのEntityListConfigを定義し、EntityListTemplateに渡すとテーブルが表示される
- [ ] ダミーのEntityFormConfigを定義し、EntityFormTemplateに渡すとフォームが表示される
- [ ] ダミーのEntityDetailConfigを定義し、EntityDetailTemplateに渡すと詳細画面が表示される
- [ ] テンプレートの内部コードを変更せずに、設定オブジェクトの変更のみで列の追加・削除ができる

---

## 3. 技術要件

### 3.1 プロジェクト構成

```
project-root/
├── docker-compose.yml          # PostgreSQL + アプリケーション
├── prisma/
│   ├── schema.prisma           # Prismaスキーマ定義
│   └── seed.ts                 # シードデータ投入
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # 認証必須ページ群
│   │   │   ├── layout.tsx      # AppLayout + 認証チェック
│   │   │   └── dashboard/
│   │   │       └── page.tsx    # ダッシュボード（Phase 0では空）
│   │   ├── (partner)/          # 代理店ポータル
│   │   │   ├── layout.tsx      # ポータルレイアウト + partner_admin/partner_staff権限チェック
│   │   │   └── portal/
│   │   │       └── page.tsx    # ポータルトップ（Phase 0では空）
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   │   └── route.ts   # NextAuth.jsエンドポイント
│   │   │   └── v1/            # APIルート
│   │   │       └── health/
│   │   │           └── route.ts  # ヘルスチェック
│   │   ├── login/
│   │   │   └── page.tsx        # ログインページ
│   │   ├── layout.tsx          # ルートレイアウト
│   │   └── page.tsx            # ルート（ログインへリダイレクト）
│   ├── components/
│   │   ├── ui/                 # shadcn/ui拡張コンポーネント
│   │   ├── form/               # フォーム部品
│   │   ├── layout/             # レイアウト部品
│   │   └── templates/          # EntityListTemplate等
│   ├── config/
│   │   └── entities/           # エンティティ設定
│   │       └── _sample.ts      # ダミー設定（動作検証用）
│   ├── hooks/                  # 共通フック
│   ├── lib/                    # ユーティリティ
│   │   ├── apiClient.ts        # 統一APIクライアント
│   │   ├── auth.ts             # NextAuth設定
│   │   ├── prisma.ts           # Prismaクライアント
│   │   └── utils.ts            # 汎用ユーティリティ
│   ├── middleware.ts            # Next.jsミドルウェア（ルートガード）
│   └── types/                  # 型定義
│       ├── api.ts              # APIレスポンス型
│       ├── config.ts           # 設定オブジェクト型
│       └── entities.ts         # エンティティ型
├── .env                        # 環境変数
├── .env.example                # 環境変数テンプレート
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

### 3.2 認証・認可

#### 認証方式

- **ライブラリ**: NextAuth.js (Auth.js v5)
- **プロバイダー**: Credentials Provider（メールアドレス + パスワード）
- **セッション管理**: JWTストラテジー
- **パスワードハッシュ**: bcrypt

#### ロール定義

| ロール | 説明 | アクセス範囲 |
|---|---|---|
| `admin` | システム管理者 | 全事業・全データへのフルアクセス |
| `staff` | 担当者 | 所属事業のCRUD |
| `partner_admin` | 代理店管理者 | 関連事業の閲覧・代理店内の管理 |
| `partner_staff` | 代理店担当者 | 関連事業の閲覧のみ |

#### ミドルウェアによるルートガード

```typescript
// middleware.tsの振る舞い
// 1. 未認証 → /login にリダイレクト
// 2. partner_admin/partner_staff ロールが /(auth)/ にアクセス → /portal にリダイレクト
// 3. partner_admin/partner_staff以外が /(partner)/ にアクセス → /dashboard にリダイレクト
// 4. /api/v1/* → JWTトークン検証
```

#### useAuth フック

```typescript
function useAuth(): {
  user: {
    id: number;
    email: string;
    name: string;
    role: "admin" | "staff" | "partner_admin" | "partner_staff";
    partnerId: number | null;
  } | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // 権限チェック
  hasRole: (role: string | string[]) => boolean;
  canEdit: boolean;           // admin, staff のみ true
  canDelete: boolean;         // admin のみ true
  isAdmin: boolean;

  // 操作
  signOut: () => Promise<void>;
};
```

### 3.3 データベース

#### ORM: Prisma

- Prisma Clientによる型安全なデータベースアクセス
- `prisma/schema.prisma` でスキーマを一元管理
- `prisma migrate dev` によるマイグレーション管理
- `prisma db seed` によるシードデータ投入

#### Docker Compose構成

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:14
    environment:
      POSTGRES_DB: management_system
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: app_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://app_user:app_password@db:5432/management_system
    depends_on:
      - db
```

#### Phase 0で作成するテーブル

Phase 0では認証と事業切り替えに必要な最低限のテーブルのみ作成する。

**users**

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | ユーザーID |
| user_email | VARCHAR(255) | UNIQUE, NOT NULL | メールアドレス |
| user_password_hash | VARCHAR(255) | NOT NULL | パスワードハッシュ（bcrypt） |
| user_name | VARCHAR(100) | NOT NULL | ユーザー名 |
| user_role | VARCHAR(20) | NOT NULL | ロール |
| user_partner_id | INTEGER | FK → partners.id, NULL | 代理店ユーザーの場合の代理店ID |
| user_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |
| created_by | INTEGER | FK → users.id | 作成者 |
| updated_by | INTEGER | FK → users.id | 更新者 |

**businesses**

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | 事業ID |
| business_code | VARCHAR(20) | UNIQUE, NOT NULL | 事業コード |
| business_name | VARCHAR(100) | NOT NULL | 事業名 |
| business_description | TEXT | | 事業説明 |
| business_config | JSONB | DEFAULT '{}' | 事業固有設定 |
| business_project_prefix | VARCHAR(10) | UNIQUE, NOT NULL | 案件番号プレフィックス |
| business_is_active | BOOLEAN | DEFAULT true | 有効フラグ |
| business_sort_order | INTEGER | DEFAULT 0 | 表示順 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |
| created_by | INTEGER | FK → users.id | 作成者 |
| updated_by | INTEGER | FK → users.id | 更新者 |

**user_business_assignments**

| カラム名 | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | ID |
| user_id | INTEGER | FK → users.id, NOT NULL | ユーザーID |
| business_id | INTEGER | FK → businesses.id, NOT NULL | 事業ID |
| assignment_role | VARCHAR(20) | DEFAULT 'member' | 事業内での役割 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

UNIQUE制約: `(user_id, business_id)`

#### シードデータ（seed.ts）

以下のテストデータを投入する。

```
事業:
  - { code: "moag", name: "MOAG事業", prefix: "MG" }
  - { code: "service_a", name: "サービスA事業", prefix: "SA" }

ユーザー:
  - { email: "admin@example.com", password: "admin123", name: "管理者", role: "admin" }
  - { email: "staff@example.com", password: "staff123", name: "担当者", role: "staff" }
  - { email: "partner-admin@example.com", password: "partner123", name: "代理店A管理者", role: "partner_admin" }
  - { email: "partner-staff@example.com", password: "partner123", name: "代理店Aスタッフ", role: "partner_staff" }

事業割り当て:
  - admin → MOAG事業, サービスA事業（全事業）
  - staff → MOAG事業（所属事業のみ）
```

### 3.4 共通コンポーネント（Phase 0で実装するもの）

Phase 0で実装するUIコンポーネントの一覧と責務を示す。各コンポーネントの型定義の詳細は `02_COMPONENT_DESIGN.md` を参照。

#### レイアウト系

| コンポーネント | 配置先 | 責務 |
|---|---|---|
| `AppLayout` | `components/layout/` | サイドバー + ヘッダー + メインコンテンツ領域の3カラムレイアウト |
| `Sidebar` | `components/layout/` | ナビゲーションリンク一覧 + BusinessSwitcher + ユーザー情報 |
| `BusinessSwitcher` | `components/layout/` | 事業切り替えドロップダウン |
| `PageHeader` | `components/layout/` | ページタイトル + アクションボタン + パンくずリスト |

#### データ表示系

| コンポーネント | 配置先 | 責務 |
|---|---|---|
| `DataTable` | `components/ui/` | 汎用テーブル。ソート・ページネーション対応。`columns`と`data`を受け取る |
| `StatusBadge` | `components/ui/` | ステータス値に応じた色付きバッジ表示 |
| `EmptyState` | `components/ui/` | データがない場合のプレースホルダー表示 |
| `Pagination` | `components/ui/` | ページ番号ナビゲーション |
| `LoadingSpinner` | `components/ui/` | ローディング中の表示 |
| `ErrorDisplay` | `components/ui/` | エラー発生時の表示とリトライボタン |

#### 入力系

| コンポーネント | 配置先 | 責務 |
|---|---|---|
| `FormField` | `components/form/` | フィールド型（text, number, select, date, textarea）に応じた入力コンポーネントの自動切り替え |
| `SearchInput` | `components/form/` | デバウンス付き検索入力（300msデフォルト） |
| `FilterBar` | `components/form/` | 複数フィルターの横並び表示。`FilterDef[]`を受け取る |

#### フィードバック系

| コンポーネント | 配置先 | 責務 |
|---|---|---|
| `Modal` | `components/ui/` | 汎用モーダルダイアログ |
| `ConfirmModal` | `components/ui/` | 確認・削除用のモーダル。danger/warningバリアント |
| `Toast` | `components/ui/` | 画面右上のトースト通知。success/error/warning/infoの4種類 |

#### UIライブラリ

- **shadcn/ui**: Button, Input, Select, Label, Dialog, DropdownMenu, Tabs, Card, Badge, Skeleton, Tooltip などの基本コンポーネントを導入
- **Tailwind CSS**: ユーティリティファーストのスタイリング
- **カラーテーマ**: shadcn/uiのデフォルトテーマをベースに、事業管理システムに適した配色を設定

### 3.5 共通フック（Phase 0で実装するもの）

#### useEntityList

一覧画面の全ロジックを担う汎用フック。

```typescript
function useEntityList(config: EntityListConfig): {
  // データ
  data: any[];
  loading: boolean;
  error: Error | null;

  // ページネーション
  pagination: {
    currentPage: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // 検索
  searchQuery: string;
  setSearchQuery: (query: string) => void;  // デバウンス付き

  // フィルター
  filters: Record<string, any>;
  setFilter: (key: string, value: any) => void;
  clearFilters: () => void;

  // ソート
  sortConfig: { field: string; direction: "asc" | "desc" };
  setSort: (field: string) => void;  // 同じフィールドで方向トグル

  // リフレッシュ
  refresh: () => void;
};
```

内部実装方針:
- TanStack Queryでサーバー状態管理
- URLSearchParamsとの自動同期（ページ・フィルター・ソートをURL上に保持）
- デバウンス付き検索（300ms）

#### useEntityDetail

詳細画面のデータ取得と操作を担う汎用フック。

```typescript
function useEntityDetail(config: EntityDetailConfig, id: string): {
  data: any | null;
  loading: boolean;
  error: Error | null;
  relatedData: Record<string, any[]>;
  relatedLoading: Record<string, boolean>;
  deleteEntity: () => Promise<void>;
  refresh: () => void;
};
```

#### useEntityForm

フォーム画面の状態管理・バリデーション・送信を担う汎用フック。

```typescript
function useEntityForm(config: EntityFormConfig, id?: string): {
  // フォーム状態
  formData: Record<string, any>;
  setField: (key: string, value: any) => void;
  errors: Record<string, string>;

  // 送信
  submit: () => Promise<void>;
  isSubmitting: boolean;

  // モード
  mode: "create" | "edit";
  isLoading: boolean;  // 編集時の初期データ読み込み

  // ユーティリティ
  isDirty: boolean;
  reset: () => void;
};
```

内部実装方針:
- Zodによるバリデーション（`config.validationSchema`を使用）
- 編集モード時は既存データをAPIから取得して初期値として設定
- 送信後は`config.redirectAfterSave`に基づいてリダイレクト

#### useAuth

認証状態と権限チェックを提供するフック。仕様は「3.2 認証・認可」の項を参照。

#### useBusiness

現在選択中の事業コンテキストを管理するフック。

```typescript
function useBusiness(): {
  currentBusiness: {
    id: number;
    businessCode: string;
    businessName: string;
  } | null;
  businesses: Array<{
    id: number;
    businessCode: string;
    businessName: string;
  }>;
  switchBusiness: (businessId: number) => void;
  isLoading: boolean;
};
```

内部実装方針:
- Zustandで事業選択状態を管理
- localStorageで選択状態を永続化
- ページロード時にlocalStorageから復元

#### useToast

トースト通知を制御するフック。

```typescript
function useToast(): {
  toast: (options: {
    title?: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
    duration?: number;  // デフォルト 5000ms
  }) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
};
```

### 3.6 テンプレート画面

Phase 0では以下の3つのテンプレートコンポーネントを実装する。設定オブジェクトの型定義は `02_COMPONENT_DESIGN.md` に詳述されている。

#### EntityListTemplate

`EntityListConfig`を受け取り、以下の構造の一覧画面を自動構築する。

```
+-----------------------------------------------+
| PageHeader: タイトル + [新規作成]                 |
+-----------------------------------------------+
| SearchInput + FilterBar                        |
+-----------------------------------------------+
| DataTable（ソート・行クリック対応）                |
|  +------+----------+--------+------+------+    |
|  | No   | 名前      | ステータス| 金額  | 日付  |    |
|  +------+----------+--------+------+------+    |
|  | ...  | ...      | ...    | ...  | ...  |    |
|  +------+----------+--------+------+------+    |
+-----------------------------------------------+
| Pagination                                     |
+-----------------------------------------------+
```

- 内部で`useEntityList`フックを使用
- 行クリックで`config.detailPath(id)`に遷移
- データがない場合は`EmptyState`を表示
- ローディング中は`LoadingSpinner`を表示
- エラー時は`ErrorDisplay`を表示

#### EntityDetailTemplate

`EntityDetailConfig`を受け取り、タブ付き詳細画面を自動構築する。

```
+-----------------------------------------------+
| PageHeader: エンティティ名 + [編集] [削除]        |
+-----------------------------------------------+
| TabLayout                                      |
| +--------+--------+----------+--------+        |
| |基本情報 | 担当者  | 関連案件   | ファイル|        |
| +---+----+--------+----------+--------+        |
|     v                                          |
| +-----------------------------------------+    |
| | セクション: 基本情報                        |    |
| | +-------------+-------------+           |    |
| | | フィールド1   | フィールド2   |           |    |
| | | フィールド3   | フィールド4   |           |    |
| | +-------------+-------------+           |    |
| +-----------------------------------------+    |
+-----------------------------------------------+
```

- 内部で`useEntityDetail`フックを使用
- タブの`component`種別に応じて表示を切り替え
- 削除ボタンは`ConfirmModal`で確認後に実行

#### EntityFormTemplate

`EntityFormConfig`を受け取り、セクション分割されたフォーム画面を自動構築する。

```
+-----------------------------------------------+
| PageHeader: 新規作成 / 編集                      |
+-----------------------------------------------+
| FormLayout                                     |
| +-----------------------------------------+    |
| | セクション: 基本情報（2列グリッド）           |    |
| | +---------------+---------------+       |    |
| | | フィールド1 *   | フィールド2 *   |       |    |
| | | [入力]         | [入力]         |       |    |
| | +---------------+---------------+       |    |
| | | フィールド3     | フィールド4     |       |    |
| | | [入力]         | [選択]         |       |    |
| | +---------------+---------------+       |    |
| +-----------------------------------------+    |
|                                               |
| [キャンセル]                        [保存]      |
+-----------------------------------------------+
```

- 内部で`useEntityForm`フックを使用
- `config.sections[].columns`に応じてグリッド列数を変更
- 必須フィールドにはアスタリスク（*）を表示
- バリデーションエラーはフィールド直下に赤文字で表示
- 送信中はボタンを無効化し、ローディング表示

### 3.7 API設計

#### 統一レスポンス形式

全APIエンドポイントは以下の形式に従う。

**成功（一覧取得）**:
```json
{
  "success": true,
  "data": [
    { "id": 1, "customerName": "株式会社A", "customerCode": "C001" }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

**成功（単体取得・作成・更新）**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "customerName": "株式会社A",
    "customerCode": "C001"
  }
}
```

**エラー**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容にエラーがあります",
    "details": [
      { "field": "customerName", "message": "顧客名は必須です" }
    ]
  }
}
```

#### エラーコード体系

| コード | HTTPステータス | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーションエラー |
| `UNAUTHORIZED` | 401 | 未認証 |
| `FORBIDDEN` | 403 | 権限不足 |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `CONFLICT` | 409 | 重複エラー（ユニーク制約違反等） |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー |

#### snake_case / camelCase 変換

- **APIレスポンス**: Prismaから取得した`snake_case`のデータを`camelCase`に自動変換して返却
- **APIリクエスト**: フロントエンドから送信された`camelCase`のデータを`snake_case`に自動変換してPrismaに渡す
- **変換ユーティリティ**: `lib/utils.ts`に`toCamelCase`、`toSnakeCase`のヘルパー関数を実装

#### 統一APIクライアント（フロントエンド）

```typescript
// lib/apiClient.ts
class ApiClient {
  // レスポンス変換（snake_case → camelCase）は自動
  // エラーハンドリングは統一

  async getList<T>(endpoint: string, params?: ListParams): Promise<ListResponse<T>>;
  async getById<T>(endpoint: string, id: string): Promise<T>;
  async create<T>(endpoint: string, data: Partial<T>): Promise<T>;
  async update<T>(endpoint: string, id: string, data: Partial<T>): Promise<T>;
  async delete(endpoint: string, id: string): Promise<void>;
}

// ListParams型
type ListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  filters?: Record<string, any>;
};
```

#### エラーハンドリング基盤

- **APIルート**: 全APIルートで共通のtry-catchラッパーを使用し、統一エラーレスポンスを返却
- **フロントエンド**: ApiClientが統一エラーレスポンスをパースし、useToastと連携してユーザーに通知
- **バリデーションエラー**: Zodスキーマによるバリデーション結果を`details`配列に変換して返却

#### Phase 0で実装するAPIエンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/api/auth/[...nextauth]` | NextAuth.js認証エンドポイント |
| GET | `/api/v1/health` | ヘルスチェック |
| GET | `/api/v1/businesses` | 事業一覧取得（認証ユーザーの所属事業） |

---

## 4. 受け入れ基準

### 4.1 環境構築

- [ ] `docker-compose up` で PostgreSQL とアプリケーションが起動する
- [ ] `npx prisma migrate dev` でマイグレーションが正常に実行される
- [ ] `npx prisma db seed` でシードデータが投入される
- [ ] `http://localhost:3000` でアプリケーションにアクセスできる

### 4.2 認証

- [ ] adminユーザー（admin@example.com / admin123）でログインできる
- [ ] ログイン失敗時にエラーメッセージが表示される
- [ ] 未認証状態で`/(auth)/`配下にアクセスすると`/login`にリダイレクトされる
- [ ] 代理店ユーザー（partner_admin/partner_staff）でログインすると`/portal`に遷移する
- [ ] ログアウトすると`/login`に遷移する

### 4.3 レイアウトとナビゲーション

- [ ] サイドバーに「ダッシュボード」リンクが表示され、クリックで遷移できる
- [ ] 事業切り替え（BusinessSwitcher）が動作し、選択した事業名が表示される
- [ ] ヘッダーにユーザー名と通知ベルアイコン（プレースホルダー）が表示される
- [ ] レスポンシブ対応（最低1280px幅で正常表示）

### 4.4 テンプレート動作

- [ ] ダミーのEntityListConfigをEntityListTemplateに渡すとテーブルが表示される
- [ ] ダミーのEntityFormConfigをEntityFormTemplateに渡すとフォームが表示される
- [ ] ダミーのEntityDetailConfigをEntityDetailTemplateに渡すと詳細画面が表示される
- [ ] テーブルのソートが動作する
- [ ] ページネーションが動作する
- [ ] 検索入力がデバウンス付きで動作する

### 4.5 コード品質

- [ ] TypeScriptの型エラーがゼロ
- [ ] ESLintエラーがゼロ
- [ ] 全コンポーネントの主要Propsに型定義がある
- [ ] `types/config.ts`に設定オブジェクトの型が定義されている

---

## 5. Phase 1への引き継ぎ

### 5.1 Phase 1の作業内容

Phase 0の成果物を使い、Phase 1では以下を行う。

1. **Prismaスキーマの拡張**: `customers`, `customer_contacts`, `partners`, `partner_contacts`, `partner_business_links` テーブルを追加
2. **エンティティ設定の作成**: `config/entities/customer.ts`, `config/entities/partner.ts` を作成
3. **ページファイルの作成**: テンプレートに設定を渡すだけの薄いページコンポーネント
4. **APIルートの作成**: CRUD操作のAPIルート

### 5.2 Phase 0の成功基準

Phase 1において**新しい共通コンポーネントの作成が不要**であること。

具体的には、以下の手順だけで顧客一覧画面が動作することを確認する。

```typescript
// 1. config/entities/customer.ts を作成
export const customerListConfig: EntityListConfig = {
  entityType: "customer",
  apiEndpoint: "/api/v1/customers",
  title: "顧客一覧",
  columns: [
    { key: "customerCode", label: "顧客コード", sortable: true },
    { key: "customerName", label: "顧客名", sortable: true },
  ],
  search: {
    placeholder: "顧客名、コードで検索",
    fields: ["customerName", "customerCode"],
  },
  filters: [],
  defaultSort: { field: "customerCode", direction: "asc" },
  detailPath: (id) => `/customers/${id}`,
  createPath: "/customers/new",
};

// 2. app/(auth)/customers/page.tsx を作成
import { EntityListTemplate } from "@/components/templates/EntityListTemplate";
import { customerListConfig } from "@/config/entities/customer";

export default function CustomerListPage() {
  return <EntityListTemplate config={customerListConfig} />;
}
```

設定ファイルとページファイルの追加のみで画面が動作し、共通コンポーネントやフックの修正が不要であることがPhase 0の成功基準である。
