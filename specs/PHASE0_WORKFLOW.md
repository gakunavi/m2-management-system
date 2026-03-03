# Phase 0 実装ワークフロー

> **参照元**: [03_PHASE0_PRD.md](./03_PHASE0_PRD.md) / [05_PHASE0_DETAILED_DESIGN.md](./05_PHASE0_DETAILED_DESIGN.md)
>
> **運用ルール**:
> 1. 各Stepの「確認チェック」を上から順に実行する
> 2. 全項目が ✅ になったら次のStepに進む
> 3. NG項目がある場合はそのStep内で修正し、再度全項目を確認する
> 4. `npm run type-check` は各Step完了時に必ず実行する（型エラーの早期検出）
>
> **🚫 ゲートを越えずに先に進まないこと** — 後続Stepでの問題切り分けが不能になる

---

## 依存関係マップ

```
Step 1 (環境構築)
  └─→ Step 2 (DB)
        └─→ Step 3 (認証基盤)
              └─→ Step 4 (ミドルウェア + 最小画面)
                    └─→ Step 5 (Providers + ルートレイアウト)
                          ├─→ Step 6 (ユーティリティ + API基盤)
                          └─→ Step 7 (型定義) ※Step 6と並行可
                                └─→ Step 8 (共通フック)
                                      └─→ Step 9 (UIコンポーネント)
                                            └─→ Step 10 (レイアウト)
                                                  └─→ Step 11 (テンプレート + ダミー)
                                                        └─→ Step 12 (最終仕上げ + 統合確認)
```

> **並行実装可能**: Step 6 と Step 7 は依存関係がなく並行して進めることができる。

---

## Step 1: 環境構築

**目的**: Docker + Next.js + shadcn/ui の動作基盤を確立する

### 作成・変更ファイル

```
project-root/
├── docker-compose.yml        ← 新規作成
├── .env                      ← 新規作成
├── .env.example              ← 新規作成
├── .gitignore                ← 更新
├── package.json              ← 依存パッケージ追加
├── tsconfig.json             ← パスエイリアス設定
├── next.config.js            ← 設定
├── tailwind.config.ts        ← 設定
├── postcss.config.js         ← 設定
└── components.json           ← shadcn/ui設定
```

### タスクリスト

- [ ] `npx create-next-app@latest m2-management-system` でプロジェクト生成
  - TypeScript: Yes / ESLint: Yes / Tailwind: Yes / App Router: Yes / src/: Yes
- [ ] `docker-compose.yml` 作成（PostgreSQL 16コンテナのみ）
- [ ] 依存パッケージ追加:
  ```bash
  npm install prisma @prisma/client next-auth bcryptjs zod \
    @tanstack/react-query zustand @tanstack/react-query-devtools
  npm install -D @types/bcryptjs
  ```
- [ ] `.env` / `.env.example` 作成（DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL）
- [ ] `npx shadcn-ui@latest init` でshadcn/uiセットアップ
- [ ] `tsconfig.json` に `@/*` パスエイリアス設定（`"@/*": ["./src/*"]`）
- [ ] `package.json` に `type-check` スクリプト追加: `"type-check": "tsc --noEmit"`

### 確認チェック

- [ ] `docker compose up -d` → `docker compose ps` で postgres コンテナが `running` 状態
- [ ] `npm install` がエラーなく完了
- [ ] `npm run dev` → ブラウザで `http://localhost:3000` にNext.jsデフォルトページが表示される
- [ ] `npm run type-check` → エラーゼロ

### NG時の対処

| 症状 | 対処 |
|-----|------|
| Docker起動失敗 | `docker compose logs db` でログ確認。ポート競合は5432を変更 |
| npm install失敗 | Node.js v18以上か確認: `node -v` |
| shadcn/ui init失敗 | `components.json` の `tailwind.config` パスが正しいか確認 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 2に進まない。

---

## Step 2: データベース

**目的**: Prismaスキーマ定義・マイグレーション・シードデータ投入

### 作成・変更ファイル

```
prisma/
├── schema.prisma             ← 新規作成（User, Business, UserBusinessAssignment）
└── seed.ts                   ← 新規作成（4ユーザー + 2事業 + 3割り当て）
```

### タスクリスト

- [ ] `npx prisma init` でPrismaセットアップ
- [ ] `prisma/schema.prisma` に3モデル定義:
  - `User` (id, user_email, user_password_hash, user_name, user_role, user_partner_id, user_is_active, created_at, updated_at, created_by, updated_by)
  - `Business` (id, business_code, business_name, business_description, business_config, business_project_prefix, business_is_active, business_sort_order, ...)
  - `UserBusinessAssignment` (id, user_id, business_id, assignment_role) + UNIQUE(user_id, business_id)
- [ ] `package.json` に `seed` スクリプト追加:
  ```json
  "prisma": { "seed": "tsx prisma/seed.ts" }
  ```
- [ ] `prisma/seed.ts` 作成（bcryptでパスワードハッシュ化して投入）:
  - admin@example.com / admin123 / role: admin
  - staff@example.com / staff123 / role: staff
  - partner-admin@example.com / partner123 / role: partner_admin
  - partner-staff@example.com / partner123 / role: partner_staff
  - 事業: MOAG事業(moag/MG), サービスA事業(service_a/SA)
  - 割り当て: admin→2事業, staff→MOAG事業のみ
- [ ] `npx prisma migrate dev --name init` 実行
- [ ] `npx prisma db seed` 実行

### 確認チェック

- [ ] `npx prisma migrate dev --name init` → "Your database is now in sync" メッセージ表示
- [ ] `npx prisma db seed` → "Seeding completed." 表示（エラーなし）
- [ ] `npx prisma studio` → ブラウザで目視確認:
  - users テーブル: 4件（admin, staff, partner-admin, partner-staff）
  - businesses テーブル: 2件（MOAG事業, サービスA事業）
  - user_business_assignments テーブル: 3件（admin→2事業, staff→1事業）
- [ ] `npx prisma studio` → users の `user_password_hash` が `$2a$` で始まるbcryptハッシュ
- [ ] `npm run type-check` → エラーゼロ

### NG時の対処

| 症状 | 対処 |
|-----|------|
| migrate失敗 | DATABASE_URLが正しいか確認。DBコンテナが起動しているか確認 |
| seed失敗 | `npx prisma migrate reset` でDBリセット後に再実行 |
| bcrypt import失敗 | `npm install bcryptjs @types/bcryptjs` |

**🚫 ゲート**: 全項目 ✅ になるまでStep 3に進まない。

---

## Step 3: 認証基盤

**目的**: NextAuth.js によるCredentials認証とログイン画面の実装

### 作成・変更ファイル

```
src/
├── types/
│   └── auth.ts               ← 新規作成（NextAuth型拡張）
├── lib/
│   ├── prisma.ts             ← 新規作成（Prismaクライアントシングルトン）
│   └── auth.ts               ← 新規作成（NextAuth設定）
└── app/
    ├── api/
    │   └── auth/
    │       └── [...nextauth]/
    │           └── route.ts  ← 新規作成（NextAuth APIルート）
    └── login/
        └── page.tsx          ← 新規作成（ログイン画面）
```

### タスクリスト

- [ ] `src/lib/prisma.ts` 作成（グローバルシングルトンパターン）
- [ ] `src/types/auth.ts` 作成（Session・JWT の型拡張）:
  ```typescript
  // NextAuth Session に role, partnerId を追加
  declare module "next-auth" {
    interface Session { user: { id: number; role: string; partnerId: number | null; } }
    interface JWT { role: string; partnerId: number | null; }
  }
  ```
- [ ] `src/lib/auth.ts` 作成（NextAuth設定）:
  - Credentials Provider（email + password）
  - bcrypt.compare でパスワード検証
  - JWT strategy（sessionStrategy: "jwt"）
  - callbacks: jwt（roleをtokenに追加）, session（tokenからuserに転送）
  - pages: { signIn: "/login" }
- [ ] `src/app/api/auth/[...nextauth]/route.ts` 作成
- [ ] `src/app/login/page.tsx` 作成（メールアドレス + パスワード入力フォーム）
- [ ] `.env` に `NEXTAUTH_SECRET`, `NEXTAUTH_URL=http://localhost:3000` を設定

### 確認チェック

- [ ] ブラウザで `http://localhost:3000/login` → ログイン画面が表示される
- [ ] `admin@example.com` / `admin123` でログイン → URL が `/dashboard` に変わる（404でもOK）
- [ ] `admin@example.com` / `wrongpassword` でログイン → エラーメッセージ表示
- [ ] `staff@example.com` / `staff123` でログイン → URL が `/dashboard` に変わる
- [ ] `partner-admin@example.com` / `partner123` でログイン → URL が `/dashboard` か `/portal` に変わる
- [ ] 開発者ツール → Application → Cookies → `next-auth.session-token` が存在する
- [ ] `npm run type-check` → エラーゼロ

### NG時の対処

| 症状 | 対処 |
|-----|------|
| ログイン後に404 | ログイン成功（URLが変わる）なら正常。Step 4でpages追加 |
| 認証エラー | ターミナルでPrismaクエリエラーを確認。DATABASE_URLを再確認 |
| NEXTAUTH_SECRET未設定エラー | `.env` に `NEXTAUTH_SECRET=<openssl rand -base64 32>` を追加 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 4に進まない。

---

## Step 4: ミドルウェア + ルートガード + 最小画面

**目的**: 認証・ロール別リダイレクトを確立し、最小限のページ構造を作る

### 作成・変更ファイル

```
src/
├── middleware.ts             ← 新規作成（withAuth + ロールリダイレクト）
└── app/
    ├── page.tsx              ← 新規作成（/ → /login リダイレクト）
    ├── (auth)/
    │   ├── layout.tsx        ← 新規作成（最小版: シンプルなdivのみ）
    │   └── dashboard/
    │       └── page.tsx      ← 新規作成（「ダッシュボード」テキストのみ）
    └── (partner)/
        ├── layout.tsx        ← 新規作成（最小版: シンプルなdivのみ）
        └── portal/
            └── page.tsx      ← 新規作成（「ポータル」テキストのみ）
```

### タスクリスト

- [ ] `src/middleware.ts` 作成:
  ```typescript
  // 振る舞い:
  // 1. 未認証 → /login にリダイレクト
  // 2. partner_admin/partner_staff が /(auth)/ にアクセス → /portal にリダイレクト
  // 3. それ以外が /(partner)/ にアクセス → /dashboard にリダイレクト
  // 4. /api/v1/* → JWTトークン検証
  // matcher: /login と /api/auth を除外すること
  ```
- [ ] `src/app/page.tsx` 作成（`redirect("/login")`）
- [ ] `src/app/(auth)/layout.tsx` 作成（最小版: `<div>{children}</div>`）
- [ ] `src/app/(auth)/dashboard/page.tsx` 作成（`<p>ダッシュボード</p>`）
- [ ] `src/app/(partner)/layout.tsx` 作成（最小版）
- [ ] `src/app/(partner)/portal/page.tsx` 作成（`<p>ポータル</p>`）

### 確認チェック

- [ ] 未ログイン状態で `http://localhost:3000/dashboard` → `/login` にリダイレクト
- [ ] `admin@example.com` でログイン → `/dashboard` に遷移し「ダッシュボード」テキスト表示
- [ ] `partner-admin@example.com` でログイン → `/portal` に遷移し「ポータル」テキスト表示
- [ ] adminでログイン後、URLバーに手動で `/portal` → `/dashboard` にリダイレクト
- [ ] partner-adminでログイン後、URLバーに手動で `/dashboard` → `/portal` にリダイレクト
- [ ] `http://localhost:3000/` → `/login` にリダイレクト
- [ ] `npm run type-check` → エラーゼロ

### NG時の対処

| 症状 | 対処 |
|-----|------|
| リダイレクトループ | matcher設定で `/login` と `/api/auth` が除外されているか確認 |
| partner-adminが/dashboardに飛ぶ | middleware.tsのroleチェック条件を確認（token.role） |

**🚫 ゲート**: 全項目 ✅ になるまでStep 5に進まない。

---

## Step 5: Providers + ルートレイアウト

**目的**: 全ページで利用するProviders（SessionProvider, QueryClientProvider, Zustand）を配置

### 作成・変更ファイル

```
src/
├── providers/
│   └── index.tsx             ← 新規作成（'use client' Providers集約）
└── app/
    ├── layout.tsx            ← 更新（RootLayoutにProviders追加）
    └── globals.css           ← 更新（Tailwindベーススタイル）
```

### タスクリスト

- [ ] `src/providers/index.tsx` 作成:
  ```typescript
  "use client";
  // SessionProvider + QueryClientProvider + ToastContainer を統合
  // staleTime: 5分, gcTime: 10分 で QueryClient を設定
  ```
- [ ] `src/app/layout.tsx` 更新（`<Providers>` でwrap）
- [ ] `src/app/globals.css` 設定（shadcn/ui CSS変数 + Tailwind指令）

### 確認チェック

- [ ] `admin@example.com` でログイン → `/dashboard` 表示（Step 4と同様に動作）
- [ ] 開発者ツール → Console に Provider系エラーなし（`useSession must be wrapped in SessionProvider` 等）
- [ ] `npm run type-check` → エラーゼロ

### NG時の対処

| 症状 | 対処 |
|-----|------|
| SessionProviderエラー | Providers内で `'use client'` が宣言されているか確認 |
| QueryClientエラー | QueryClientをコンポーネント外で生成していないか確認 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 6に進まない。

---

## Step 6: 共通ユーティリティ + API基盤

**目的**: 全APIで使う統一レスポンス形式・エラーハンドリング・APIクライアントを実装

### 作成・変更ファイル

```
src/
├── types/
│   └── api.ts                ← 新規作成（ApiResponse, ApiErrorResponse, ListResponse型）
├── lib/
│   ├── utils.ts              ← 新規作成（cn, toCamelCase, toSnakeCase, formatDate, formatCurrency）
│   ├── api-client.ts         ← 新規作成（フロントエンド用ApiClientクラス）
│   ├── error-handler.ts      ← 新規作成（ApiError + handleApiError）
│   └── api-handler.ts        ← 新規作成（withApiAuth ラッパー）
└── app/
    └── api/
        └── v1/
            ├── health/
            │   └── route.ts  ← 新規作成
            └── businesses/
                └── route.ts  ← 新規作成
```

### タスクリスト

- [ ] `src/types/api.ts` 作成（統一レスポンス型定義）
- [ ] `src/lib/utils.ts` 作成:
  - `cn()` — tailwind-merge + clsx
  - `toCamelCase()` — snake_case → camelCase（ネスト・配列対応）
  - `toSnakeCase()` — camelCase → snake_case
  - `formatDate()` — 日付フォーマット
  - `formatCurrency()` — 通貨フォーマット
- [ ] `src/lib/error-handler.ts` 作成（ApiErrorクラス + handleApiError関数）
- [ ] `src/lib/api-handler.ts` 作成（withApiAuth: JWT検証 + ロールチェック）
- [ ] `src/lib/api-client.ts` 作成（getList, getById, create, update, delete メソッド）
- [ ] `GET /api/v1/health` 実装（DB接続確認、latency_ms付きレスポンス）
- [ ] `GET /api/v1/businesses` 実装（認証済みユーザーの所属事業一覧）

### 確認チェック

- [ ] `http://localhost:3000/api/v1/health` → `{"success":true,"data":{"status":"healthy","timestamp":"..."}}`
- [ ] adminでログイン後、Console で:
  ```javascript
  fetch('/api/v1/businesses').then(r => r.json()).then(console.log)
  ```
  → 2件の事業データ（MOAG事業, サービスA事業）が返る
- [ ] シークレットウィンドウ（未認証）で `/api/v1/businesses` → 401 `{"success":false,"error":{"code":"UNAUTHORIZED"}}`
- [ ] `npm run type-check` → エラーゼロ

### NG時の対処

| 症状 | 対処 |
|-----|------|
| health APIが500 | Prismaクライアントの接続確認。DBコンテナが起動しているか |
| businesses APIが空 | `npx prisma studio` でシードデータ確認 |
| camelCase変換が効かない | toCamelCaseの再帰処理確認 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 7/8に進まない。

> **並行可**: Step 7（型定義）はStep 6と同時進行できる。

---

## Step 7: 型定義

**目的**: 設定オブジェクトドリブンアーキテクチャの根幹となる型を確立

### 作成・変更ファイル

```
src/
└── types/
    ├── config.ts             ← 新規作成（EntityListConfig等の設定オブジェクト型）
    └── entities.ts           ← 新規作成（Phase 0用エンティティ型）
```

### タスクリスト

- [ ] `src/types/config.ts` 作成（以下の型を全て定義）:
  - `ColumnDef` — テーブル列定義
  - `FilterDef` — フィルター定義
  - `EntityListConfig` — 一覧画面設定
  - `EntityDetailConfig` — 詳細画面設定
  - `TabDef` — タブ定義
  - `InfoTabConfig` — 情報タブ設定
  - `FieldDisplayDef` — フィールド表示定義
  - `RelatedTabConfig` — 関連データタブ設定
  - `EntityFormConfig` — フォーム画面設定
  - `FormSectionDef` — フォームセクション定義
  - `FormFieldDef` — フォームフィールド定義
- [ ] `src/types/entities.ts` 作成（Phase 0用: User, Business の最小型）

### 確認チェック

- [ ] `npm run type-check` → エラーゼロ
- [ ] `src/types/config.ts` に以下の型が全て存在する:
  - `ColumnDef`, `FilterDef`, `EntityListConfig`
  - `EntityDetailConfig`, `TabDef`, `InfoTabConfig`, `FieldDisplayDef`, `RelatedTabConfig`
  - `EntityFormConfig`, `FormSectionDef`, `FormFieldDef`

### NG時の対処

| 症状 | 対処 |
|-----|------|
| 型エラー | `@/` パスエイリアスがtsconfig.jsonで設定されているか確認 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 8に進まない。

---

## Step 8: 共通フック

**目的**: テンプレート画面の全ロジックを担う汎用フックを実装

### 作成・変更ファイル

```
src/
└── hooks/
    ├── use-auth.ts           ← 新規作成
    ├── use-business.ts       ← 新規作成（Zustand + TanStack Query）
    ├── use-toast.ts          ← 新規作成（Zustand）
    ├── use-debounce.ts       ← 新規作成
    ├── use-entity-list.ts    ← 新規作成（TanStack Query + URLSearchParams同期）
    ├── use-entity-detail.ts  ← 新規作成
    └── use-entity-form.ts    ← 新規作成（Zodバリデーション + 送信）
```

### タスクリスト

- [ ] `use-debounce.ts` 作成（汎用デバウンス、デフォルト300ms）
- [ ] `use-auth.ts` 作成:
  - `useSession()` からuser情報取得
  - `hasRole()`, `canEdit`, `canDelete`, `isAdmin` を計算
  - `signOut()` ラッパー
- [ ] `use-toast.ts` 作成（Zustandストア + toast/dismiss/dismissAll）
- [ ] `use-business.ts` 作成:
  - Zustandで選択事業を管理
  - `localStorage` で永続化（`persist` ミドルウェア）
  - `/api/v1/businesses` から事業一覧をTanStack Queryで取得
  - `switchBusiness()` 実装
- [ ] `use-entity-list.ts` 作成:
  - TanStack Queryでデータ取得（`config.apiEndpoint`）
  - URLSearchParamsと自動同期（page, search, sort, filters）
  - デバウンス付き検索（`use-debounce` 利用）
- [ ] `use-entity-detail.ts` 作成:
  - TanStack Queryで単体データ取得
  - `deleteEntity()` 実装（`useToast` でフィードバック）
- [ ] `use-entity-form.ts` 作成:
  - create/editモード判定（idの有無）
  - Zodバリデーション（`config.validationSchema`）
  - 送信後 `config.redirectAfterSave` にリダイレクト
  - 409 VERSION_CONFLICTのエラーハンドリング

### 確認チェック

- [ ] `npm run type-check` → エラーゼロ
- [ ] ダッシュボードにテストコードを一時追加して動作確認:
  ```typescript
  const { user, isAdmin } = useAuth();
  console.log('useAuth:', { user, isAdmin });
  // → { user: { name: "管理者", role: "admin" }, isAdmin: true }

  const { currentBusiness, businesses } = useBusiness();
  console.log('useBusiness:', { currentBusiness, businesses });
  // → businesses: 2件

  const { toast } = useToast();
  // ボタンクリックでトースト表示確認
  ```
- [ ] ブラウザ Console に useAuth のユーザー情報が正しく表示
- [ ] ブラウザ Console に useBusiness の事業一覧が2件表示
- [ ] トースト通知が画面右上に表示される
- [ ] **テストコードを削除する**

### NG時の対処

| 症状 | 対処 |
|-----|------|
| useAuthでuserがnull | SessionProviderの配置確認（Step 5のProviders） |
| useBusinessで空配列 | `/api/v1/businesses` のレスポンスをStep 6で再確認 |
| トーストが表示されない | ToastContainerがProvidersに配置されているか確認 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 9に進まない。

---

## Step 9: UIコンポーネント

**目的**: shadcn/ui基本コンポーネントのインストールとカスタムコンポーネントの実装

### 作成・変更ファイル

```
src/
└── components/
    ├── ui/
    │   ├── [shadcn/uiコンポーネント群]  ← インストール
    │   ├── data-table.tsx        ← 新規作成
    │   ├── pagination.tsx        ← 新規作成
    │   ├── status-badge.tsx      ← 新規作成
    │   ├── empty-state.tsx       ← 新規作成
    │   ├── loading-spinner.tsx   ← 新規作成
    │   ├── error-display.tsx     ← 新規作成
    │   ├── confirm-modal.tsx     ← 新規作成
    │   └── toast-container.tsx   ← 新規作成
    └── form/
        ├── form-field.tsx        ← 新規作成
        ├── search-input.tsx      ← 新規作成
        └── filter-bar.tsx        ← 新規作成
```

### タスクリスト

- [ ] shadcn/uiコンポーネントインストール:
  ```bash
  npx shadcn-ui@latest add button input label select dialog \
    dropdown-menu tabs card badge skeleton tooltip table \
    separator textarea checkbox
  ```
- [ ] `DataTable` 実装:
  - `columns: ColumnDef[]` と `data: T[]` を受け取る汎用テーブル
  - ソート: ヘッダークリックで `↑`/`↓` アイコン切り替え
  - 行クリック: `onRowClick(row)` コールバック
  - Skeletonローディング対応
- [ ] `Pagination` 実装（ページ番号 + 表示件数セレクター）
- [ ] `StatusBadge` 実装（status値 → 色付きバッジ自動変換）
- [ ] `EmptyState` 実装（アイコン + タイトル + 説明 + アクションボタン）
- [ ] `LoadingSpinner` 実装（メッセージ付きスピナー）
- [ ] `ErrorDisplay` 実装（エラーメッセージ + リトライボタン）
- [ ] `ConfirmModal` 実装（danger/warningバリアント、タイトル+メッセージ+確認ボタン）
- [ ] `ToastContainer` 実装（画面右上固定、success/error/warning/info対応）
- [ ] `FormField` 実装（text/number/select/date/textarea/email を type で自動切り替え）
- [ ] `SearchInput` 実装（デバウンス付き、クリアボタン付き）
- [ ] `FilterBar` 実装（`FilterDef[]` を受け取り横並びフィルター表示）

### 確認チェック

- [ ] shadcn/ui全コンポーネントのインストール成功
- [ ] `npm run type-check` → エラーゼロ
- [ ] ダッシュボードにテストコードを一時追加して目視確認:
  ```typescript
  <LoadingSpinner message="読み込み中..." />
  <EmptyState title="データなし" description="テスト表示" />
  <ErrorDisplay message="テストエラー" onRetry={() => alert('retry')} />
  <StatusBadge status="確認済み" />
  ```
- [ ] 各コンポーネントが正しくレンダリング（レイアウト崩れ・Consoleエラーなし）
- [ ] **テストコードを削除する**

### NG時の対処

| 症状 | 対処 |
|-----|------|
| shadcn/uiインストール失敗 | `components.json` のパス設定確認 |
| コンポーネント描画エラー | `'use client'` 宣言の有無確認 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 10に進まない。

---

## Step 10: レイアウト

**目的**: サイドバー + ヘッダー + BusinessSwitcher の本格レイアウトを完成させる

### 作成・変更ファイル

```
src/
├── config/
│   └── navigation.ts         ← 新規作成（ナビゲーション定義）
├── components/
│   └── layout/
│       ├── sidebar.tsx        ← 新規作成
│       ├── sidebar-nav.tsx    ← 新規作成
│       ├── business-switcher.tsx ← 新規作成
│       ├── header.tsx         ← 新規作成
│       └── page-header.tsx    ← 新規作成
└── app/
    ├── (auth)/
    │   └── layout.tsx         ← 更新（最小版 → Sidebar+Header+Main 本格版）
    └── (partner)/
        └── layout.tsx         ← 更新（最小版 → ポータルレイアウト本格版）
```

### タスクリスト

- [ ] `src/config/navigation.ts` 作成（ナビリンク定義: icon, label, href, requiredRole）
- [ ] `Sidebar` 実装:
  - 「M2管理システム」ロゴ
  - `BusinessSwitcher`（事業切り替えドロップダウン）
  - `SidebarNav`（ナビゲーションリンク一覧）
  - ユーザー情報（名前 + ロール）
  - ログアウトボタン
- [ ] `SidebarNav` 実装（アクティブリンクハイライト）
- [ ] `BusinessSwitcher` 実装（`useBusiness()` 使用、localStorage永続化）
- [ ] `Header` 実装（ユーザー名 + 通知ベルアイコン）
- [ ] `PageHeader` 実装（タイトル + パンくずリスト + アクションボタン）
- [ ] `(auth)/layout.tsx` 本格版に差し替え（Sidebar + Header + `<main>`）
- [ ] `(partner)/layout.tsx` ポータルレイアウト本格版に差し替え

### 確認チェック

- [ ] `admin@example.com` でログイン → サイドバー付きレイアウト表示
  - 左側: 「M2管理システム」ロゴ + BusinessSwitcher + ナビゲーション + ユーザー情報 + ログアウト
  - 上部: ヘッダー（ユーザー名「管理者」 + 通知ベル）
- [ ] サイドバーの「ダッシュボード」リンクがアクティブ状態（ハイライト）
- [ ] BusinessSwitcher で「MOAG事業」「サービスA事業」が表示される
- [ ] BusinessSwitcher で事業を切り替え → 選択した事業名が表示される
- [ ] F5でページ更新 → 選択した事業が保持されている（localStorage永続化）
- [ ] ログアウトボタン押下 → `/login` に遷移
- [ ] `staff@example.com` でログイン → BusinessSwitcher に「MOAG事業」のみ表示（1件）
- [ ] `partner-admin@example.com` でログイン → ポータルレイアウト（サイドバーなし）
- [ ] ブラウザ幅1280pxでレイアウト崩れなし
- [ ] `npm run type-check` → エラーゼロ

### NG時の対処

| 症状 | 対処 |
|-----|------|
| サイドバーが表示されない | AuthLayoutの構造確認 |
| BusinessSwitcherが空 | useBusiness内のAPI呼び出し確認 |
| 事業が保持されない | Zustand persistの `name` 設定確認 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 11に進まない。

---

## Step 11: テンプレート + ダミー設定 + ダミーAPI

**目的**: 設定オブジェクトドリブンの3テンプレートを実装し、Phase 0の完了条件を検証

### 作成・変更ファイル

```
src/
├── components/
│   └── templates/
│       ├── entity-list-template.tsx   ← 新規作成
│       ├── entity-detail-template.tsx ← 新規作成
│       └── entity-form-template.tsx   ← 新規作成
├── config/
│   └── entities/
│       └── _sample.ts        ← 新規作成（ダミー設定: List + Detail + Form）
└── app/
    ├── api/
    │   └── v1/
    │       └── samples/
    │           └── route.ts  ← 新規作成（インメモリ50件ダミーAPI）
    └── (auth)/
        └── samples/
            └── page.tsx      ← 新規作成（サンプル一覧ページ）
```

### タスクリスト

- [ ] `EntityListTemplate` 実装:
  - `useEntityList(config)` フックを使用
  - PageHeader + SearchInput + FilterBar + DataTable + Pagination 構成
  - ローディング → `LoadingSpinner`
  - データなし → `EmptyState`
  - エラー → `ErrorDisplay`
  - 行クリック → `config.detailPath(id)` に遷移
  - 「新規作成」ボタン → `config.createPath` に遷移
- [ ] `EntityDetailTemplate` 実装:
  - `useEntityDetail(config, id)` フックを使用
  - PageHeader + タブレイアウト（`config.tabs`）構成
  - 削除ボタン → `ConfirmModal` 確認後に削除
- [ ] `EntityFormTemplate` 実装:
  - `useEntityForm(config, id)` フックを使用
  - PageHeader + セクション分割フォーム構成
  - `FormField` でフィールドtype自動切り替え
  - 必須フィールドに `*` 表示
  - バリデーションエラーをフィールド直下に表示
  - 送信中はボタンを無効化 + ローディング表示
- [ ] `src/config/entities/_sample.ts` 作成（List + Detail + Form の全設定オブジェクト）
- [ ] `GET /api/v1/samples` 実装（インメモリ50件、検索/ソート/ページネーション対応）
- [ ] `GET /api/v1/samples/:id` 実装（単体取得）
- [ ] `src/app/(auth)/samples/page.tsx` 作成（EntityListTemplateに_sampleListConfigを渡すだけ）
- [ ] `navigation.ts` にサンプルリンクを**一時的に**追加

### 確認チェック

**EntityListTemplate**:
- [ ] 「サンプル」リンクをクリック → サンプル一覧画面が表示（テーブルにデフォルト25件）
- [ ] テーブルヘッダーの「ID」をクリック → ソート切り替え（↑/↓ アイコン変化）
- [ ] 検索欄に「サンプル 1」入力 → 約0.3秒後にフィルタリング（デバウンス動作）
- [ ] 検索クリアボタン（×）→ 全件表示に戻る
- [ ] ページネーション「>」→ 2ページ目表示
- [ ] 表示件数を「10」に変更 → 10件表示、1ページ目に戻る
- [ ] 検索で0件 → EmptyState 表示
- [ ] `_sample.ts` の columns にメール列追加 → テンプレート変更なしで列が表示（**設定駆動の検証**）

**EntityDetailTemplate**:
- [ ] ダミー詳細画面が基本情報セクションを表示（2列レイアウト）

**EntityFormTemplate**:
- [ ] ダミーフォームが「基本情報」「詳細情報」の2セクション表示
- [ ] 各フィールドが正しいinput type で表示（text, select, number, email, textarea）
- [ ] 必須フィールドに赤いアスタリスク（*）が表示
- [ ] 「保存」ボタンが表示される

**共通**:
- [ ] `npm run type-check` → エラーゼロ
- [ ] ブラウザ Console にエラーなし

### NG時の対処

| 症状 | 対処 |
|-----|------|
| テーブルが空 | `/api/v1/samples` をブラウザで直接確認 |
| ソートが効かない | DataTableの `onSort` コールバック確認 |
| 設定追加で列が増えない | EntityListTemplateが `config.columns` を動的に描画しているか確認 |

**🚫 ゲート**: 全項目 ✅ になるまでStep 12に進まない。

---

## Step 12: 最終仕上げ + 統合確認

**目的**: Phase 0の全フローを通した最終検証とビルド確認

### 作成・変更ファイル

```
src/
└── app/
    ├── (auth)/
    │   └── dashboard/
    │       └── page.tsx      ← 更新（PageHeader + プレースホルダー）
    ├── (partner)/
    │   └── portal/
    │       └── page.tsx      ← 更新（ポータルトップ最終版）
    ├── error.tsx             ← 新規作成（グローバルエラーバウンダリ）
    └── not-found.tsx         ← 新規作成（404ページ）
```

### タスクリスト

- [ ] `dashboard/page.tsx` 最終版（PageHeader + 「Phase 1で実装予定」プレースホルダー）
- [ ] `portal/page.tsx` 最終版（ポータルトップの案内表示）
- [ ] `src/app/error.tsx` 作成（グローバルエラーバウンダリ: `'use client'` + ErrorDisplay）
- [ ] `src/app/not-found.tsx` 作成（404ページ: ホームに戻るリンク付き）
- [ ] `navigation.ts` からサンプルリンクを削除（ダミー設定・ダミーAPIは残す）

### 確認チェック（最終統合テスト）

- [ ] `docker compose down && docker compose up -d` → PostgreSQLが起動
- [ ] `npx prisma migrate reset --force` → DBリセット + シード完了
- [ ] `npm run dev` → `http://localhost:3000` → ログイン画面
- [ ] admin / admin123 でログイン → ダッシュボード（サイドバー + ヘッダー + メイン）
- [ ] BusinessSwitcher → 2事業表示、切り替え可能、F5で保持
- [ ] ログアウト → ログイン画面
- [ ] partner-admin / partner123 でログイン → ポータル画面
- [ ] URLバーで `/dashboard` → `/portal` にリダイレクト
- [ ] ログアウト → admin でログイン → URLバーで `/portal` → `/dashboard` にリダイレクト
- [ ] 存在しないURL `/nonexistent` → 404ページ表示
- [ ] `npm run type-check` → エラーゼロ
- [ ] `npm run lint` → エラーゼロ
- [ ] `npm run build` → ビルド成功

**🚫 ゲート**: 全項目 ✅ なら **Phase 0 完了**。

---

## Phase 0 完了後: Phase 1 移行チェック

Phase 0の成功条件は「**設定ファイルとページファイルの追加のみで新しい画面が動作する**」こと。

```typescript
// ✅ Phase 0完了の証明: これだけで顧客一覧画面が動作すること
// 1. config/entities/customer.ts を作成
export const customerListConfig: EntityListConfig = {
  entityType: "customer",
  apiEndpoint: "/api/v1/customers",
  title: "顧客一覧",
  columns: [
    { key: "customerCode", label: "顧客コード", sortable: true },
    { key: "customerName", label: "顧客名", sortable: true },
  ],
  search: { placeholder: "顧客名、コードで検索", fields: ["customerName", "customerCode"] },
  filters: [],
  defaultSort: { field: "customerCode", direction: "asc" },
  detailPath: (id) => `/customers/${id}`,
  createPath: "/customers/new",
};

// 2. app/(auth)/customers/page.tsx を作成
export default function CustomerListPage() {
  return <EntityListTemplate config={customerListConfig} />;
}
// 共通コンポーネントやフックの修正が不要であればPhase 0成功
```

---

## 参考: 推奨パッケージ一覧

| パッケージ | バージョン目安 | 用途 |
|-----------|-------------|------|
| `next` | ^14.x | App Router |
| `react`, `react-dom` | ^18.x | UI |
| `typescript` | ^5.x | 型安全 |
| `prisma`, `@prisma/client` | ^5.x | ORM |
| `next-auth` | ^4.x (安定版) | 認証 |
| `bcryptjs` | ^2.x | パスワードハッシュ |
| `zod` | ^3.x | バリデーション |
| `@tanstack/react-query` | ^5.x | サーバー状態管理 |
| `zustand` | ^4.x | クライアント状態管理 |
| `tailwindcss` | ^3.x | スタイリング |
| `tailwind-merge` | ^2.x | クラス結合 |
| `clsx` | ^2.x | 条件付きクラス |
| `@tanstack/react-query-devtools` | ^5.x | 開発ツール |
| `tsx` | ^4.x | seedスクリプト実行 |

---

## 全般トラブルシューティング

### .next キャッシュ破損

| 症状 | 対処 |
|-----|------|
| 全ページで500エラー、サーバーログに `Cannot find module './vendor-chunks/xxx.js'` | `.next` を削除して devサーバー再起動 |
| 新ファイルを大量追加した後にdevサーバーが不安定になる | 同上 |
| ビルドキャッシュとソースの不整合でランタイムエラーが発生 | 同上 |

```bash
# 手順
# 1. devサーバーを停止 (Ctrl+C)
# 2. キャッシュ削除
rm -rf .next
# 3. devサーバー再起動
npm run dev
```

**補足**: `npm run build` 実行時もキャッシュ不整合でエラーが出る場合は同手順で対処可能。
