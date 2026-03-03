# Phase 0: 詳細設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [00_PROJECT_PRD.md](./00_PROJECT_PRD.md) | 全体ゴール、ユーザー種別、技術スタック |
> | [01_DATA_MODEL.md](./01_DATA_MODEL.md) | テーブル定義、命名規則 |
> | [02_COMPONENT_DESIGN.md](./02_COMPONENT_DESIGN.md) | 設定オブジェクト型定義、フック設計 |
> | [03_PHASE0_PRD.md](./03_PHASE0_PRD.md) | Phase 0の要件・受け入れ基準 |

---

## 目次

1. [実装概要](#1-実装概要)
2. [環境構築](#2-環境構築)
3. [データベース実装](#3-データベース実装)
4. [認証・認可実装](#4-認証認可実装)
5. [ミドルウェア実装](#5-ミドルウェア実装)
6. [API基盤実装](#6-api基盤実装)
7. [型定義](#7-型定義)
8. [共通フック実装](#8-共通フック実装)
9. [UIコンポーネント実装](#9-uiコンポーネント実装)
10. [レイアウト実装](#10-レイアウト実装)
11. [テンプレート画面実装](#11-テンプレート画面実装)
12. [画面実装](#12-画面実装)
13. [エラーハンドリング](#13-エラーハンドリング)
14. [Providers構成](#14-providers構成)
15. [テスト計画](#15-テスト計画)
16. [実装チェックリスト](#16-実装チェックリスト)
17. [Phase 1 拡張ガイド](#17-phase-1-拡張ガイド)

---

## 1. 実装概要

### 1.1 実装スコープと非スコープ

**スコープ（Phase 0で実装するもの）:**

- Docker Compose + Next.js 14 (App Router) + Prisma + PostgreSQL
- NextAuth.js v4（安定版）による認証・認可
- ミドルウェアによるルートガード
- 共通フック（useEntityList, useEntityDetail, useEntityForm, useAuth, useBusiness, useToast）
- shadcn/ui ベースの共通UIコンポーネント
- 設定オブジェクトドリブンの3テンプレート（List, Detail, Form）
- ダミー設定による動作検証

**非スコープ（Phase 1以降）:**

- 顧客・代理店・案件のCRUD API
- データフィルタリング（事業切り替えによる）
- CSV import/export
- ファイルアップロード
- ムーブメント管理
- ダッシュボードの実コンテンツ

### 1.2 ゲート付き実装順序

実装は依存関係に基づく以下の順序で行う。**各Stepのゲート基準を全て満たしてから次のStepに進むこと。** ゲート未達のまま先に進むと、後続Stepで問題の原因特定が困難になる。

> **運用ルール**:
> 1. 各Stepの「確認チェック」を上から順に実行する
> 2. 全項目が ✅ になったら次のStepに進む
> 3. NG項目がある場合はそのStep内で修正し、再度全項目を確認する
> 4. `npm run type-check` は各Step完了時に必ず実行する（型エラーの早期検出）

---

#### Step 1: 環境構築

**対象ファイル**: `docker-compose.yml`, `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.env`, `.env.example`, `.gitignore`, `components.json`

**作業内容**:
1. プロジェクトディレクトリ作成、`npx create-next-app@latest` でNext.js 14プロジェクト生成
2. `docker-compose.yml` 作成（PostgreSQL 16のみ）
3. `package.json` に依存パッケージ追加（prisma, next-auth, bcryptjs, zod, @tanstack/react-query, zustand 等）
4. `.env` / `.env.example` 作成
5. `npx shadcn-ui@latest init` でshadcn/uiセットアップ
6. `.gitignore` 設定

**確認チェック**:
- [ ] `docker compose up -d` → `docker compose ps` で postgres コンテナが `running` 状態
- [ ] `npm install` がエラーなく完了
- [ ] `npm run dev` → ブラウザで `http://localhost:3000` にNext.jsデフォルトページが表示される
- [ ] `npm run type-check` → エラーゼロ

**NG時の対処**: Docker起動失敗 → `docker compose logs db` でログ確認。ポート競合の場合は5432を変更。npm install失敗 → Node.js v18以上か確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 2に進まない。

---

#### Step 2: データベース

**対象ファイル**: `prisma/schema.prisma`, `prisma/seed.ts`

**作業内容**:
1. Prismaスキーマ定義（User, Business, UserBusinessAssignment の3モデル）
2. マイグレーション実行
3. シードデータ作成（4ユーザー + 2事業 + 3割り当て）

**確認チェック**:
- [ ] `npx prisma migrate dev --name init` → "Your database is now in sync" メッセージ表示
- [ ] `npx prisma db seed` → "Seeding completed." 表示（エラーなし）
- [ ] `npx prisma studio` → ブラウザで以下を目視確認:
  - users テーブル: 4件（admin, staff, partner-admin, partner-staff）
  - businesses テーブル: 2件（MOAG事業, サービスA事業）
  - user_business_assignments テーブル: 3件（admin→2事業, staff→1事業）
- [ ] `npx prisma studio` → users の user_password_hash が `$2a$` で始まるbcryptハッシュであること
- [ ] `npm run type-check` → エラーゼロ

**NG時の対処**: migrate失敗 → DATABASE_URLが正しいか確認。seed失敗 → `npx prisma migrate reset` でDBリセット後に再実行。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 3に進まない。

---

#### Step 3: 認証基盤

**対象ファイル**: `src/types/auth.ts`, `src/lib/auth.ts`, `src/lib/prisma.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`

**作業内容**:
1. Prismaクライアントシングルトン作成
2. NextAuth型拡張（Session, JWT）
3. NextAuth設定（Credentials Provider + JWT）
4. NextAuth APIルート作成
5. ログイン画面実装

**確認チェック**:
- [ ] ブラウザで `http://localhost:3000/login` → ログイン画面（メールアドレス + パスワード入力欄）が表示される
- [ ] `admin@example.com` / `admin123` でログイン → URL が `/dashboard` に変わる（※画面は404でもOK、URLの遷移を確認）
- [ ] `admin@example.com` / `wrongpassword` でログイン → 「メールアドレスまたはパスワードが正しくありません」エラー表示
- [ ] `staff@example.com` / `staff123` でログイン → URL が `/dashboard` に変わる
- [ ] `partner-admin@example.com` / `partner123` でログイン → URL が `/portal` に変わる（※ミドルウェアはStep 4のため、この時点ではまだ/dashboardでもOK）
- [ ] ブラウザの開発者ツール → Application → Cookies → `next-auth.session-token` が存在する
- [ ] `npm run type-check` → エラーゼロ

**NG時の対処**: ログイン失敗 → `npm run dev` のターミナルログでPrismaクエリエラーを確認。NEXTAUTH_SECRETが.envに設定されているか確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 4に進まない。

---

#### Step 4: ミドルウェア + ルートガード + 最小画面

**対象ファイル**: `src/middleware.ts`, `src/app/(auth)/layout.tsx`（最小版）, `src/app/(auth)/dashboard/page.tsx`（最小版）, `src/app/(partner)/layout.tsx`（最小版）, `src/app/(partner)/portal/page.tsx`（最小版）, `src/app/page.tsx`

**作業内容**:
1. Next.jsミドルウェア実装（withAuth）
2. ルートグループの最小レイアウト作成（この時点ではSidebar等なしのシンプルなdiv）
3. ダッシュボード・ポータルの最小ページ作成（「ダッシュボード」「ポータル」テキストのみ表示）
4. ルートページ（/login リダイレクト）

**確認チェック**:
- [ ] 未ログイン状態でブラウザから `http://localhost:3000/dashboard` → `/login` にリダイレクトされる
- [ ] `admin@example.com` でログイン → `/dashboard` に遷移し「ダッシュボード」テキスト表示
- [ ] `partner-admin@example.com` でログイン → `/portal` に遷移し「ポータル」テキスト表示
- [ ] adminでログイン後、URLバーに手動で `/portal` と入力 → `/dashboard` にリダイレクトされる
- [ ] partner-adminでログイン後、URLバーに手動で `/dashboard` と入力 → `/portal` にリダイレクトされる
- [ ] ブラウザから `http://localhost:3000/` → `/login` にリダイレクトされる
- [ ] `npm run type-check` → エラーゼロ

**NG時の対処**: リダイレクトループ → middleware.tsのmatcher設定で `/login` と `/api/auth` が除外されているか確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 5に進まない。

---

#### Step 5: Providers + ルートレイアウト

**対象ファイル**: `src/providers/index.tsx`, `src/app/layout.tsx`, `src/app/globals.css`

**作業内容**:
1. Providers コンポーネント作成（SessionProvider + QueryClientProvider + ToastContainer）
2. ルートレイアウトにProviders配置
3. globals.css設定

**確認チェック**:
- [ ] `admin@example.com` でログイン → `/dashboard` 表示（Step 4と同様に動作する）
- [ ] ブラウザ開発者ツール → Console にエラーが出ていないこと（特に「useSession must be wrapped in SessionProvider」等が出ないこと）
- [ ] `npm run type-check` → エラーゼロ

**NG時の対処**: SessionProviderエラー → Providers内で`'use client'`が宣言されているか確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 6に進まない。

---

#### Step 6: 共通ユーティリティ + API基盤

**対象ファイル**: `src/lib/utils.ts`, `src/lib/api-client.ts`, `src/lib/error-handler.ts`, `src/lib/api-handler.ts`, `src/types/api.ts`, `src/app/api/v1/health/route.ts`, `src/app/api/v1/businesses/route.ts`

**作業内容**:
1. ユーティリティ関数（cn, toCamelCase, toSnakeCase, formatCurrency, formatDate）
2. APIレスポンス型定義
3. APIエラーハンドラー（ApiError + handleApiError）
4. APIルートラッパー（withApiAuth）
5. フロントエンド用APIクライアント（ApiClient + ApiClientError）
6. ヘルスチェックAPI
7. 事業一覧API

**確認チェック**:
- [ ] ブラウザで `http://localhost:3000/api/v1/health` → `{"success":true,"data":{"status":"healthy","timestamp":"..."}}`
- [ ] adminでログイン後、ブラウザの開発者ツール → Console で以下を実行:
  ```javascript
  fetch('/api/v1/businesses').then(r => r.json()).then(console.log)
  ```
  → `{"success":true,"data":[{"id":1,"businessCode":"moag","businessName":"MOAG事業",...},...]}`（2件）
- [ ] シークレットウィンドウ（未認証）で `http://localhost:3000/api/v1/businesses` → `{"success":false,"error":{"code":"UNAUTHORIZED",...}}` で401レスポンス
- [ ] `npm run type-check` → エラーゼロ

**NG時の対処**: health APIが500 → Prismaクライアントの接続確認。businesses APIが空 → シードデータの確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 7に進まない。

---

#### Step 7: 型定義

**対象ファイル**: `src/types/config.ts`, `src/types/entities.ts`

**作業内容**:
1. 設定オブジェクト型（EntityListConfig, EntityDetailConfig, EntityFormConfig + 関連型）
2. エンティティ型（Phase 0用の最小定義）

**確認チェック**:
- [ ] `npm run type-check` → エラーゼロ
- [ ] `src/types/config.ts` に以下の型が全て存在する: `ColumnDef`, `FilterDef`, `EntityListConfig`, `EntityDetailConfig`, `TabDef`, `InfoTabConfig`, `FieldDisplayDef`, `RelatedTabConfig`, `EntityFormConfig`, `FormSectionDef`, `FormFieldDef`

**NG時の対処**: 型エラー → インポートパスのエイリアス（`@/`）がtsconfig.jsonで設定されているか確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 8に進まない。

---

#### Step 8: 共通フック

**対象ファイル**: `src/hooks/use-auth.ts`, `src/hooks/use-business.ts`, `src/hooks/use-toast.ts`, `src/hooks/use-debounce.ts`, `src/hooks/use-entity-list.ts`, `src/hooks/use-entity-detail.ts`, `src/hooks/use-entity-form.ts`

**作業内容**:
1. useAuth — セッションからユーザー情報・権限チェック
2. useBusiness — Zustand + TanStack Query で事業選択管理
3. useToast — Zustandでトースト管理
4. useDebounce — 汎用デバウンス
5. useEntityList — 一覧画面のデータ取得・検索・ソート・ページネーション
6. useEntityDetail — 詳細画面のデータ取得
7. useEntityForm — フォーム状態管理・送信

**確認チェック**:
- [ ] `npm run type-check` → エラーゼロ
- [ ] ダッシュボード画面（Step 4で作成済み）のコンポーネント内に以下のテストコードを一時的に追加して動作確認:
  ```typescript
  const { user, isAdmin } = useAuth();
  console.log('useAuth:', { user, isAdmin });

  const { currentBusiness, businesses } = useBusiness();
  console.log('useBusiness:', { currentBusiness, businesses });

  const { toast } = useToast();
  // ボタンクリック時に toast({ message: 'テスト', type: 'success' }) を呼ぶ
  ```
- [ ] ブラウザ Console に useAuth のユーザー情報が表示される（name: "管理者", role: "admin"）
- [ ] ブラウザ Console に useBusiness の事業一覧が表示される（2件）
- [ ] テスト用ボタンをクリック → トースト通知が画面右上に表示される（ToastContainerはStep 5でProvidersに配置済み）
- [ ] **テストコードを削除する**（残さないこと）

**NG時の対処**: useAuthでuserがnull → SessionProviderの配置確認。useBusinessで空配列 → `/api/v1/businesses` のレスポンスをStep 6で再確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 9に進まない。

---

#### Step 9: UIコンポーネント

**対象ファイル**: shadcn/uiコンポーネント群 + `src/components/ui/data-table.tsx`, `pagination.tsx`, `status-badge.tsx`, `empty-state.tsx`, `loading-spinner.tsx`, `error-display.tsx`, `confirm-modal.tsx`, `toast-container.tsx` + `src/components/form/form-field.tsx`, `search-input.tsx`, `filter-bar.tsx`

**作業内容**:
1. shadcn/ui基本コンポーネントインストール（button, input, label, select, dialog, dropdown-menu, tabs, card, badge, skeleton, tooltip, table, separator, textarea, checkbox）
2. DataTable, Pagination, StatusBadge, EmptyState, LoadingSpinner, ErrorDisplay, ConfirmModal, ToastContainer 実装
3. FormField, SearchInput, FilterBar 実装

**確認チェック**:
- [ ] `npx shadcn-ui@latest add button input label select dialog dropdown-menu tabs card badge skeleton tooltip table separator textarea checkbox` → 全てインストール成功
- [ ] `npm run type-check` → エラーゼロ
- [ ] ダッシュボードに以下のテスト表示コードを一時追加して各コンポーネントが描画されることを目視確認:
  ```typescript
  <LoadingSpinner message="読み込み中..." />
  <EmptyState title="データなし" description="テスト表示" />
  <ErrorDisplay message="テストエラー" onRetry={() => alert('retry')} />
  <StatusBadge status="確認済み" />
  ```
- [ ] 各コンポーネントが正しくレンダリングされる（レイアウト崩れ・エラーなし）
- [ ] **テストコードを削除する**

**NG時の対処**: shadcn/uiインストール失敗 → `components.json` のパス設定確認。コンポーネント描画エラー → `'use client'` 宣言の有無確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 10に進まない。

---

#### Step 10: レイアウト

**対象ファイル**: `src/config/navigation.ts`, `src/components/layout/sidebar.tsx`, `src/components/layout/sidebar-nav.tsx`, `src/components/layout/business-switcher.tsx`, `src/components/layout/header.tsx`, `src/components/layout/page-header.tsx`, `src/app/(auth)/layout.tsx`（本格版に差し替え）, `src/app/(partner)/layout.tsx`（本格版に差し替え）

**作業内容**:
1. ナビゲーション定義
2. Sidebar（ナビゲーション + BusinessSwitcher + ユーザー情報 + ログアウト）
3. BusinessSwitcher
4. Header（ユーザー名 + 通知ベル）
5. PageHeader（タイトル + パンくず + アクション）
6. AuthLayout を Sidebar + Header + Main に差し替え
7. PortalLayout を本格版に差し替え

**確認チェック**:
- [ ] `admin@example.com` でログイン → サイドバー付きレイアウトが表示される
  - 左側にサイドバー（「M2管理システム」ロゴ + BusinessSwitcher + ナビゲーション + ユーザー情報 + ログアウトボタン）
  - 上部にヘッダー（ユーザー名「管理者」 + 通知ベルアイコン）
  - メイン領域にダッシュボード内容
- [ ] サイドバーの「ダッシュボード」リンクがアクティブ状態（ハイライト）で表示される
- [ ] BusinessSwitcher で「MOAG事業」「サービスA事業」が表示される
- [ ] BusinessSwitcher で事業を切り替え → 選択した事業名が表示される
- [ ] ページを更新（F5） → 選択した事業が保持されている（localStorageで永続化）
- [ ] ログアウトボタン押下 → `/login` に遷移する
- [ ] `staff@example.com` でログイン → BusinessSwitcher に「MOAG事業」のみ表示（1件）
- [ ] `partner-admin@example.com` でログイン → ポータルレイアウト（サイドバーなし）が表示される
- [ ] ブラウザ幅1280pxでレイアウト崩れがないこと
- [ ] `npm run type-check` → エラーゼロ

**NG時の対処**: サイドバーが表示されない → AuthLayoutの構造確認。BusinessSwitcherが空 → useBusiness内のAPI呼び出し確認。事業が保持されない → Zustand persistのname設定確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 11に進まない。

---

#### Step 11: テンプレート + ダミー設定 + ダミーAPI

**対象ファイル**: `src/components/templates/entity-list-template.tsx`, `entity-detail-template.tsx`, `entity-form-template.tsx`, `src/config/entities/_sample.ts`, `src/app/api/v1/samples/route.ts`, `src/app/(auth)/samples/page.tsx`

**作業内容**:
1. EntityListTemplate 実装
2. EntityDetailTemplate 実装
3. EntityFormTemplate 実装
4. ダミー設定ファイル（_sample.ts: List + Detail + Form）
5. ダミーAPI（50件のインメモリデータ）
6. サンプル一覧ページ
7. ナビゲーションにサンプルリンク一時追加

**確認チェック（一覧テンプレート — EntityListTemplate）**:
- [ ] サイドバーの「サンプル」リンク（一時追加）をクリック → サンプル一覧画面が表示される
- [ ] テーブルにデータ行が表示されている（デフォルト25件/ページ）
- [ ] テーブルヘッダーの「ID」をクリック → ソートが切り替わる（↑ / ↓ アイコン変化）
- [ ] 検索欄に「サンプル 1」と入力 → 約0.3秒後にフィルタリングされる（デバウンス動作）
- [ ] 検索欄のクリアボタン（×）をクリック → 全件表示に戻る
- [ ] ページネーションの「>」をクリック → 2ページ目が表示される
- [ ] 表示件数を「10」に変更 → 10件表示に切り替わり、1ページ目に戻る
- [ ] データがない状態（検索で該当なし）→ EmptyState が表示される
- [ ] `_sample.ts` の columns に `{ key: 'email', label: 'メール', width: 200 }` を追加 → テンプレート変更なしでメール列が表示される

**確認チェック（詳細テンプレート — EntityDetailTemplate）**:
- [ ] ダミー詳細画面（※ダミーAPI `GET /api/v1/samples/1` を追加するか、テスト用の直接表示で確認）が基本情報セクションを表示する
- [ ] フィールドのラベルと値が2列レイアウトで表示される

**確認チェック（フォームテンプレート — EntityFormTemplate）**:
- [ ] ダミーフォーム画面が「基本情報」「詳細情報」の2セクションを表示する
- [ ] 各フィールドが正しいinput type で表示される（text, select, number, email, textarea）
- [ ] 必須フィールドに赤いアスタリスク（*）が表示される
- [ ] 「保存」ボタンが表示される

**共通確認**:
- [ ] `npm run type-check` → エラーゼロ
- [ ] ブラウザ Console にエラーが出ていないこと

**NG時の対処**: テーブルが空 → `/api/v1/samples` のレスポンスをブラウザで直接確認。ソートが効かない → DataTableの`onSort` コールバック確認。

**🚫 ゲート**: 上記の全項目が ✅ になるまでStep 12に進まない。

---

#### Step 12: 最終仕上げ + 統合確認

**対象ファイル**: `src/app/(auth)/dashboard/page.tsx`（最終版）, `src/app/(partner)/portal/page.tsx`（最終版）, `src/app/error.tsx`, `src/app/not-found.tsx`

**作業内容**:
1. ダッシュボードページ最終版（PageHeader + プレースホルダー）
2. ポータルページ最終版
3. グローバルエラーバウンダリ
4. 404ページ
5. Step 11で一時追加したナビゲーションのサンプルリンクを削除（※ダミー設定・ダミーAPIは検証用に残す）

**確認チェック（最終統合テスト — 全フローを通して確認）**:
- [ ] `docker compose down && docker compose up -d` → PostgreSQLが起動
- [ ] `npx prisma migrate reset --force` → DBリセット + シード完了
- [ ] `npm run dev` → `http://localhost:3000` にアクセス → ログイン画面
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

**🚫 ゲート**: 上記の全項目が ✅ なら Phase 0 完了。

### 1.3 実装原則

| 原則 | 詳細 |
|------|------|
| **型安全性** | `strict: true`、`any`の使用原則禁止。やむを得ない場合は `unknown` + 型ガード |
| **設定駆動** | テンプレートの振る舞いは設定オブジェクトで制御、テンプレート内にif分岐を極力書かない |
| **命名規則** | DB: `snake_case` / Prismaモデル: `camelCase` + `@@map` / API応答: `camelCase` / フロントエンド: `camelCase` |
| **エラー一貫性** | 全APIは `ApiResponse | ApiErrorResponse` 形式。フロントエンドはApiError classで統一処理 |
| **Server/Client境界** | `'use client'` は必要なコンポーネントのみ。レイアウトはServer Componentを維持 |

### 1.4 命名規則の詳細

| 対象 | 規則 | 例 |
|------|------|------|
| ファイル名（コンポーネント） | PascalCase | `DataTable.tsx`, `EntityListTemplate.tsx` |
| ファイル名（フック） | camelCase | `useEntityList.ts`, `useAuth.ts` |
| ファイル名（ユーティリティ） | camelCase | `apiClient.ts`, `utils.ts` |
| ファイル名（型定義） | camelCase | `config.ts`, `api.ts` |
| コンポーネント名 | PascalCase | `DataTable`, `SearchInput` |
| フック名 | use + PascalCase | `useEntityList`, `useAuth` |
| 型/Interface名 | PascalCase | `EntityListConfig`, `ApiResponse` |
| 変数/関数 | camelCase | `handleSubmit`, `formatCurrency` |
| 定数 | UPPER_SNAKE_CASE | `DEFAULT_PAGE_SIZE`, `MAX_FILE_SIZE` |
| DBカラム | snake_case | `user_email`, `business_code` |
| APIパス | kebab-case | `/api/v1/businesses`, `/api/v1/health` |

---

## 2. 環境構築

### 2.1 ディレクトリ構造

```
m2-management-system/
├── docker-compose.yml
├── .env
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── components.json               # shadcn/ui 設定
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── src/
    ├── app/
    │   ├── (auth)/                # 社内ユーザー認証必須ルートグループ
    │   │   ├── layout.tsx         # AuthLayout: Sidebar + Header + Main
    │   │   └── dashboard/
    │   │       └── page.tsx
    │   ├── (partner)/             # 代理店ポータルルートグループ
    │   │   ├── layout.tsx         # PortalLayout: 簡易レイアウト
    │   │   └── portal/
    │   │       └── page.tsx
    │   ├── api/
    │   │   ├── auth/
    │   │   │   └── [...nextauth]/
    │   │   │       └── route.ts
    │   │   └── v1/
    │   │       ├── health/
    │   │       │   └── route.ts
    │   │       └── businesses/
    │   │           └── route.ts
    │   ├── login/
    │   │   └── page.tsx
    │   ├── error.tsx              # グローバルエラーバウンダリ
    │   ├── not-found.tsx          # 404ページ
    │   ├── globals.css
    │   ├── layout.tsx             # RootLayout: Providers配置
    │   └── page.tsx               # / → /login リダイレクト
    ├── components/
    │   ├── ui/                    # shadcn/ui + 拡張コンポーネント
    │   │   ├── button.tsx         # shadcn/ui
    │   │   ├── input.tsx          # shadcn/ui
    │   │   ├── ... (shadcn/ui)
    │   │   ├── data-table.tsx     # カスタム: 汎用テーブル
    │   │   ├── pagination.tsx     # カスタム: ページネーション
    │   │   ├── status-badge.tsx   # カスタム: ステータスバッジ
    │   │   ├── empty-state.tsx    # カスタム: 空状態表示
    │   │   ├── loading-spinner.tsx # カスタム: ローディング
    │   │   ├── error-display.tsx  # カスタム: エラー表示
    │   │   ├── confirm-modal.tsx  # カスタム: 確認モーダル
    │   │   └── toast-container.tsx # カスタム: トースト表示
    │   ├── form/
    │   │   ├── form-field.tsx     # 汎用フォームフィールド
    │   │   ├── search-input.tsx   # デバウンス付き検索
    │   │   └── filter-bar.tsx     # フィルターバー
    │   ├── layout/
    │   │   ├── app-layout.tsx     # メインレイアウト構造
    │   │   ├── sidebar.tsx        # サイドバー
    │   │   ├── sidebar-nav.tsx    # ナビゲーションリンク
    │   │   ├── business-switcher.tsx # 事業切り替え
    │   │   ├── header.tsx         # ヘッダー（ユーザー名 + 通知ベル + ログアウト）
    │   │   └── page-header.tsx    # ページヘッダー（タイトル + アクション）
    │   └── templates/
    │       ├── entity-list-template.tsx
    │       ├── entity-detail-template.tsx
    │       └── entity-form-template.tsx
    ├── config/
    │   ├── navigation.ts          # サイドバーナビゲーション定義
    │   └── entities/
    │       └── _sample.ts         # ダミー設定（動作検証用）
    ├── hooks/
    │   ├── use-auth.ts
    │   ├── use-business.ts
    │   ├── use-entity-list.ts
    │   ├── use-entity-detail.ts
    │   ├── use-entity-form.ts
    │   ├── use-toast.ts
    │   └── use-debounce.ts
    ├── lib/
    │   ├── api-client.ts          # 統一HTTPクライアント
    │   ├── auth.ts                # NextAuth設定
    │   ├── prisma.ts              # Prismaクライアントシングルトン
    │   ├── error-handler.ts       # APIエラーハンドラー
    │   └── utils.ts               # 汎用ユーティリティ
    ├── providers/
    │   └── index.tsx              # Providers集約
    ├── middleware.ts               # Next.js ミドルウェア
    └── types/
        ├── api.ts                 # APIレスポンス・エラー型
        ├── auth.ts                # NextAuth型拡張
        ├── config.ts              # 設定オブジェクト型（02_COMPONENT_DESIGN準拠）
        └── entities.ts            # エンティティ型
```

### 2.2 Docker Compose 設定

**docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: m2-postgres
    environment:
      POSTGRES_DB: management_system
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: app_password
      TZ: Asia/Tokyo
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app_user -d management_system"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

> **設計判断**: Phase 0ではアプリケーションのコンテナ化は行わない。開発時は `npm run dev` でローカル実行し、DBのみDockerで起動する。これにより、ホットリロードの高速化とデバッグの容易さを優先する。本番デプロイ用のDockerfile作成はPhase 1以降で対応する。

### 2.3 環境変数設定

**.env.example**

```env
# Database
DATABASE_URL="postgresql://app_user:app_password@localhost:5432/management_system"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""  # openssl rand -base64 32 で生成

# Node
NODE_ENV="development"
```

> **注意**: `.env` は `.gitignore` に含める。`NEXTAUTH_SECRET` は32文字以上のランダム文字列を必ず設定すること。

### 2.4 package.json

```json
{
  "name": "m2-management-system",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset",
    "setup": "docker compose up -d && npm run db:migrate && npm run db:seed"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@prisma/client": "^5.14.0",
    "next-auth": "^4.24.0",
    "bcryptjs": "^2.4.3",
    "zod": "^3.23.0",
    "@tanstack/react-query": "^5.40.0",
    "zustand": "^4.5.0",
    "date-fns": "^3.6.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.3.0",
    "lucide-react": "^0.390.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/node": "^20.12.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/bcryptjs": "^2.4.6",
    "prisma": "^5.14.0",
    "ts-node": "^10.9.2",
    "tailwindcss": "^3.4.0",
    "tailwindcss-animate": "^1.0.7",
    "postcss": "^8.4.38",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0"
  },
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

> **設計判断**:
> - `bcryptjs` を使用（`bcrypt` はネイティブモジュールのためビルド問題が起きやすい。`bcryptjs` はpure JSで互換API）
> - `next-auth` は安定版v4系を使用（v5はbeta段階のためプロダクション非推奨）
> - Radix UIパッケージは個別に記載しない（`shadcn/ui add` コマンドが自動管理）

### 2.5 next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // App Router関連の設定（必要に応じて追加）
  },
};

module.exports = nextConfig;
```

### 2.6 Tailwind CSS 設定

**tailwind.config.ts** — shadcn/ui の `npx shadcn-ui@latest init` が生成する設定をそのまま使用。

**postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 2.7 .gitignore

```gitignore
# dependencies
node_modules/
.pnp
.pnp.js

# next.js
.next/
out/

# production
build/

# misc
.DS_Store
*.pem

# env files
.env
.env.local

# prisma
prisma/migrations/**/migration_lock.toml

# IDE
.vscode/
.idea/
```

---

## 3. データベース実装

### 3.1 Prisma スキーマ

**prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// Phase 0: 基盤テーブル
// ============================================

model User {
  id               Int      @id @default(autoincrement())
  userEmail        String   @unique @map("user_email") @db.VarChar(255)
  userPasswordHash String   @map("user_password_hash") @db.VarChar(255)
  userName         String   @map("user_name") @db.VarChar(100)
  userRole         String   @map("user_role") @db.VarChar(20)
  userPartnerId    Int?     @map("user_partner_id")
  userIsActive     Boolean  @default(true) @map("user_is_active")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz
  createdBy        Int?     @map("created_by")
  updatedBy        Int?     @map("updated_by")

  // Relations
  businessAssignments UserBusinessAssignment[]
  creator             User?  @relation("UserCreatedBy", fields: [createdBy], references: [id])
  updater             User?  @relation("UserUpdatedBy", fields: [updatedBy], references: [id])
  createdUsers        User[] @relation("UserCreatedBy")
  updatedUsers        User[] @relation("UserUpdatedBy")

  @@index([userRole])
  @@index([userIsActive])
  @@map("users")
}

model Business {
  id                    Int      @id @default(autoincrement())
  businessCode          String   @unique @map("business_code") @db.VarChar(20)
  businessName          String   @map("business_name") @db.VarChar(100)
  businessDescription   String?  @map("business_description") @db.Text
  businessConfig        Json     @default("{}") @map("business_config")
  businessProjectPrefix String   @unique @map("business_project_prefix") @db.VarChar(10)
  businessIsActive      Boolean  @default(true) @map("business_is_active")
  businessSortOrder     Int      @default(0) @map("business_sort_order")
  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt             DateTime @updatedAt @map("updated_at") @db.Timestamptz
  createdBy             Int?     @map("created_by")
  updatedBy             Int?     @map("updated_by")

  // Relations
  userAssignments UserBusinessAssignment[]

  @@index([businessIsActive, businessSortOrder])
  @@map("businesses")
}

model UserBusinessAssignment {
  id             Int      @id @default(autoincrement())
  userId         Int      @map("user_id")
  businessId     Int      @map("business_id")
  assignmentRole String   @default("member") @map("assignment_role") @db.VarChar(20)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@unique([userId, businessId])
  @@map("user_business_assignments")
}
```

> **PRDとの差異**: PRDの `TIMESTAMPTZ` 型指定に合わせ `@db.Timestamptz` を明示的に追加。また `users.user_role` と `users.user_is_active` にインデックスを追加（ミドルウェアでのロール判定、一覧での有効ユーザー絞り込みに使用）。

### 3.2 Prisma クライアントシングルトン

**src/lib/prisma.ts**

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

> **注意**: `global` ではなく `globalThis` を使用（TypeScript標準）。`||` ではなく `??` を使用（nullish coalescing が正確）。

### 3.3 シードデータ

**prisma/seed.ts**

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  console.log('Seeding database...');

  // トランザクションでアトミックに実行
  await prisma.$transaction(async (tx) => {
    // 既存データをクリア（FK順序を考慮）
    await tx.userBusinessAssignment.deleteMany();
    await tx.user.deleteMany();
    await tx.business.deleteMany();

    // 1. 事業マスタ
    const moag = await tx.business.create({
      data: {
        businessCode: 'moag',
        businessName: 'MOAG事業',
        businessDescription: 'MOAG関連の営業管理',
        businessProjectPrefix: 'MG',
        businessConfig: {
          projectFields: {
            customField1: { label: '機械型番', type: 'text', required: true },
          },
        },
        businessSortOrder: 1,
      },
    });

    const serviceA = await tx.business.create({
      data: {
        businessCode: 'service_a',
        businessName: 'サービスA事業',
        businessDescription: 'サービスA関連の営業管理',
        businessProjectPrefix: 'SA',
        businessConfig: {},
        businessSortOrder: 2,
      },
    });

    // 2. ユーザー
    const [adminHash, staffHash, partnerHash] = await Promise.all([
      bcrypt.hash('admin123', SALT_ROUNDS),
      bcrypt.hash('staff123', SALT_ROUNDS),
      bcrypt.hash('partner123', SALT_ROUNDS),
    ]);

    const admin = await tx.user.create({
      data: {
        userEmail: 'admin@example.com',
        userPasswordHash: adminHash,
        userName: '管理者',
        userRole: 'admin',
      },
    });

    const staff = await tx.user.create({
      data: {
        userEmail: 'staff@example.com',
        userPasswordHash: staffHash,
        userName: '担当者',
        userRole: 'staff',
        createdBy: admin.id,
      },
    });

    await tx.user.create({
      data: {
        userEmail: 'partner-admin@example.com',
        userPasswordHash: partnerHash,
        userName: '代理店A管理者',
        userRole: 'partner_admin',
        // userPartnerId: Phase 1でpartnersテーブル作成後に設定
        createdBy: admin.id,
      },
    });

    await tx.user.create({
      data: {
        userEmail: 'partner-staff@example.com',
        userPasswordHash: partnerHash,
        userName: '代理店Aスタッフ',
        userRole: 'partner_staff',
        createdBy: admin.id,
      },
    });

    // 3. 事業割り当て
    await tx.userBusinessAssignment.createMany({
      data: [
        { userId: admin.id, businessId: moag.id, assignmentRole: 'admin' },
        { userId: admin.id, businessId: serviceA.id, assignmentRole: 'admin' },
        { userId: staff.id, businessId: moag.id, assignmentRole: 'member' },
      ],
    });
  });

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

> **旧設計からの改善**:
> - `$transaction` でアトミック化（途中失敗時のゴミデータ防止）
> - `userPartnerId` に存在しないFK値（`1`）を設定しない（Phase 0ではpartnersテーブルが存在しないためFK違反になる）
> - bcryptのハッシュ生成を `Promise.all` で並列化

---

## 4. 認証・認可実装

### 4.1 NextAuth 型拡張

**src/types/auth.ts**

```typescript
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    id: string;
    role: string;
    partnerId: number | null;
    businesses: {
      id: number;
      businessCode: string;
      businessName: string;
    }[];
  }

  interface Session {
    user: {
      id: number;
      email: string;
      name: string;
      role: string;
      partnerId: number | null;
      businesses: {
        id: number;
        businessCode: string;
        businessName: string;
      }[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    partnerId: number | null;
    businesses: {
      id: number;
      businessCode: string;
      businessName: string;
    }[];
  }
}
```

> **旧設計からの改善**: NextAuthのSession/JWT型を正式に拡張。これにより `session.user.role` や `token.role` にTypeScriptの型補完が効く。旧設計では `as any[]` のキャストが必要だった問題を解消。

### 4.2 NextAuth.js 設定

**src/lib/auth.ts**

```typescript
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { userEmail: credentials.email },
          include: {
            businessAssignments: {
              include: { business: true },
              where: { business: { businessIsActive: true } },
            },
          },
        });

        if (!user || !user.userIsActive) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.userPasswordHash,
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id.toString(),
          email: user.userEmail,
          name: user.userName,
          role: user.userRole,
          partnerId: user.userPartnerId,
          businesses: user.businessAssignments.map((a) => ({
            id: a.business.id,
            businessCode: a.business.businessCode,
            businessName: a.business.businessName,
          })),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.partnerId = user.partnerId;
        token.businesses = user.businesses;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = Number(token.id);
      session.user.role = token.role;
      session.user.partnerId = token.partnerId;
      session.user.businesses = token.businesses;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24時間
  },
  secret: process.env.NEXTAUTH_SECRET,
};
```

> **旧設計からの改善**:
> - `authorize` で認証失敗時は `throw new Error` ではなく `return null` を返す（NextAuth v4の推奨パターン。throwするとエラーメッセージがURL経由でリークする可能性がある）
> - 非アクティブな事業は事業割り当て取得時にフィルタリング
> - セッション有効期限を30日→24時間に短縮（業務システムとして適切）

### 4.3 NextAuth API ルート

**src/app/api/auth/[...nextauth]/route.ts**

```typescript
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

### 4.4 useAuth フック

**src/hooks/use-auth.ts**

```typescript
'use client';

import { useSession, signOut as nextAuthSignOut } from 'next-auth/react';
import { useCallback, useMemo } from 'react';

export type UserRole = 'admin' | 'staff' | 'partner_admin' | 'partner_staff';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  partnerId: number | null;
  businesses: {
    id: number;
    businessCode: string;
    businessName: string;
  }[];
}

export function useAuth() {
  const { data: session, status } = useSession();

  const user = useMemo((): AuthUser | null => {
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      role: session.user.role as UserRole,
      partnerId: session.user.partnerId,
      businesses: session.user.businesses ?? [],
    };
  }, [session]);

  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';

  const hasRole = useCallback(
    (role: UserRole | UserRole[]): boolean => {
      if (!user) return false;
      const roles = Array.isArray(role) ? role : [role];
      return roles.includes(user.role);
    },
    [user],
  );

  const isAdmin = user?.role === 'admin';
  const canEdit = isAdmin || user?.role === 'staff';
  const canDelete = isAdmin;
  const isPartner = user?.role === 'partner_admin' || user?.role === 'partner_staff';

  const signOut = useCallback(async () => {
    await nextAuthSignOut({ callbackUrl: '/login' });
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated,
    hasRole,
    isAdmin,
    canEdit,
    canDelete,
    isPartner,
    signOut,
  };
}
```

> **旧設計からの改善**:
> - `canEdit`, `canDelete`, `isAdmin` をuseCallbackへの依存から除去（単純な派生値なので`useMemo`不要、レンダリング毎の再計算で十分）
> - `isPartner` を追加（ミドルウェアとの一貫性）
> - sessionのプロパティに安全なフォールバック値を設定（`?? ''`, `?? []`）

### 4.5 ログイン画面

**src/app/login/page.tsx**

```typescript
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// SearchParamsを使うコンポーネントを分離（Suspense boundary必須）
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('メールアドレスまたはパスワードが正しくありません');
      setIsLoading(false);
      return;
    }

    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {/* email, password の Input + Button は旧設計と同等 */}
      {/* 省略: UI構造は変更なし */}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        {/* Card + CardHeader + CardContent */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
```

> **旧設計からの改善**:
> - `useSearchParams` を使うコンポーネントを `Suspense` で包む（Next.js 14のApp Routerで必須。未対応だとビルドエラーになる）
> - エラーメッセージにサーバーからのerror文字列を直接表示しない（「ユーザーが見つかりません」等の情報漏洩を防止。統一メッセージ「メールアドレスまたはパスワードが正しくありません」を使用）
> - try-catchを除去（signInはreject しないため不要）

---

## 5. ミドルウェア実装

**src/middleware.ts**

```typescript
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;
    const token = request.nextauth.token;

    if (!token) {
      return NextResponse.next();
    }

    const role = token.role as string;
    const isPartner = role === 'partner_admin' || role === 'partner_staff';

    // 代理店ユーザーが管理画面にアクセス → /portal にリダイレクト
    if (isPartner && pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }

    // 社内ユーザーがポータルにアクセス → /dashboard にリダイレクト
    if (!isPartner && pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // /login と /api/auth は認証不要
        if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
          return true;
        }

        // /api/v1 は認証必須
        if (pathname.startsWith('/api/v1')) {
          return !!token;
        }

        // その他のページも認証必須
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
    },
  },
);

export const config = {
  matcher: [
    // 静的ファイルとfaviconを除外
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
```

> **旧設計からの改善**:
> - `next-auth/middleware` の `withAuth` を使用（手動で `getToken` するよりも堅牢。リダイレクトループの防止が組み込み済み）
> - Route Groups `(auth)` `(partner)` はURLパスに反映されないため、実際のパス（`/dashboard`, `/portal`）でマッチング
> - 旧設計のRoute Group判定 `pathname.startsWith('/(auth)')` は動作しない（Next.jsのRoute GroupはURL上からは見えない）

---

## 6. API基盤実装

### 6.1 統一APIレスポンス型

**src/types/api.ts**

```typescript
// 成功レスポンス（一覧）
export interface ApiListResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

// 成功レスポンス（単体）
export interface ApiSingleResponse<T> {
  success: true;
  data: T;
}

// エラーレスポンス
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, string>;
}
```

> **旧設計からの改善**:
> - `ApiResponse` を `ApiListResponse` と `ApiSingleResponse` に分離（一覧と単体で`meta`の有無が異なるため）
> - `ApiErrorCode` をunion type化（自由文字列→制限付きunionで型安全性向上）
> - `filters` を `Record<string, any>` → `Record<string, string>` に変更（URLパラメータなので文字列が正確）

### 6.2 APIエラーハンドラー

**src/lib/error-handler.ts**

```typescript
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { ApiErrorResponse, ApiErrorCode } from '@/types/api';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public statusCode: number,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: Array<{ field: string; message: string }>) {
    return new ApiError('VALIDATION_ERROR', message, 400, details);
  }

  static unauthorized(message = '認証が必要です') {
    return new ApiError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = '権限がありません') {
    return new ApiError('FORBIDDEN', message, 403);
  }

  static notFound(message = 'リソースが見つかりません') {
    return new ApiError('NOT_FOUND', message, 404);
  }

  static conflict(message = 'データが既に存在します') {
    return new ApiError('CONFLICT', message, 409);
  }
}

export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  // Zodバリデーションエラー
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false as const,
        error: {
          code: 'VALIDATION_ERROR' as const,
          message: '入力内容にエラーがあります',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  // カスタムApiError
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false as const,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.statusCode },
    );
  }

  // Prisma既知エラー
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return NextResponse.json(
          { success: false as const, error: { code: 'CONFLICT' as const, message: 'データが既に存在します' } },
          { status: 409 },
        );
      case 'P2025':
        return NextResponse.json(
          { success: false as const, error: { code: 'NOT_FOUND' as const, message: 'データが見つかりません' } },
          { status: 404 },
        );
    }
  }

  // 予期しないエラー
  console.error('Unhandled API error:', error);
  return NextResponse.json(
    {
      success: false as const,
      error: {
        code: 'INTERNAL_ERROR' as const,
        message: 'サーバーエラーが発生しました',
      },
    },
    { status: 500 },
  );
}
```

> **旧設計からの改善**:
> - `ApiError` クラスを導入（APIルート内で `throw ApiError.notFound()` のように使える）
> - static factoryメソッドで頻出エラーを簡潔に生成
> - レスポンスの `success` に `as const` を付与（型推論の精度向上）

### 6.3 API ルートラッパー

**src/lib/api-handler.ts**

APIルートの共通処理（セッション取得 + エラーハンドリング）をラップする。

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';

type ApiHandler = (
  request: NextRequest,
  context: { session: NonNullable<Awaited<ReturnType<typeof getServerSession>>> },
) => Promise<NextResponse>;

export function withApiAuth(handler: ApiHandler) {
  return async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user) {
        throw ApiError.unauthorized();
      }

      return await handler(request, { session });
    } catch (error) {
      return handleApiError(error);
    }
  };
}
```

### 6.4 統一 API クライアント（フロントエンド）

**src/lib/api-client.ts**

```typescript
import type { ApiListResponse, ApiSingleResponse, ApiErrorResponse, ListParams, PaginationMeta } from '@/types/api';

class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL = '/api/v1') {
    this.baseURL = baseURL;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const json = await response.json();

    if (!response.ok) {
      const error = json as ApiErrorResponse;
      throw new ApiClientError(
        error.error?.message ?? 'APIエラーが発生しました',
        error.error?.code ?? 'UNKNOWN',
        response.status,
        error.error?.details,
      );
    }

    return json;
  }

  async getList<T>(
    endpoint: string,
    params?: ListParams,
  ): Promise<{ data: T[]; meta: PaginationMeta }> {
    const searchParams = new URLSearchParams();

    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sortField) searchParams.set('sortField', params.sortField);
    if (params?.sortDirection) searchParams.set('sortDirection', params.sortDirection);
    if (params?.filters) {
      for (const [key, value] of Object.entries(params.filters)) {
        if (value) searchParams.set(`filter[${key}]`, value);
      }
    }

    const qs = searchParams.toString();
    const fullEndpoint = qs ? `${endpoint}?${qs}` : endpoint;
    const json = await this.request<ApiListResponse<T>>(fullEndpoint);

    return { data: json.data, meta: json.meta };
  }

  async getById<T>(endpoint: string, id: string | number): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(`${endpoint}/${id}`);
    return json.data;
  }

  async create<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return json.data;
  }

  async update<T>(endpoint: string, id: string | number, data: Record<string, unknown>): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(`${endpoint}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return json.data;
  }

  async remove(endpoint: string, id: string | number): Promise<void> {
    await this.request(`${endpoint}/${id}`, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export { ApiClientError };
```

> **旧設計からの改善**:
> - `ApiClientError` クラスを導入（catchブロックで `error.code`, `error.statusCode`, `error.details` にアクセス可能）
> - `getList` の返却型を `ApiListResponse` に合わせて正確に型推論
> - `delete` → `remove` にリネーム（`delete` はJSの予約語のため）
> - `create`/`update` の引数を `Partial<T>` → `Record<string, unknown>` に変更（送信データの型がレスポンス型と一致するとは限らない）

### 6.5 ユーティリティ

**src/lib/utils.ts**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * snake_case のオブジェクトキーを camelCase に変換（再帰的）
 * Date型、null、プリミティブ値はそのまま返す
 */
export function toCamelCase<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (obj instanceof Date) return obj as T;
  if (typeof obj !== 'object') return obj as T;

  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = toCamelCase(value);
  }
  return result as T;
}

/**
 * camelCase のオブジェクトキーを snake_case に変換（再帰的）
 */
export function toSnakeCase<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (obj instanceof Date) return obj as T;
  if (typeof obj !== 'object') return obj as T;

  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[snakeKey] = toSnakeCase(value);
  }
  return result as T;
}

/** 通貨フォーマット（日本円） */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
}

/** 日付フォーマット（yyyy/MM/dd） */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
```

> **旧設計からの改善**:
> - `toCamelCase`/`toSnakeCase` にジェネリクスとDate型対応を追加
> - `any` を `unknown` に変更
> - `formatDate` に不正な日付文字列のガード（`isNaN(d.getTime())`）を追加
> - `formatCurrency` に `maximumFractionDigits: 0` を追加（日本円に小数は不要）

### 6.6 ヘルスチェック API

**src/app/api/v1/health/route.ts**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Database connection failed' } },
      { status: 503 },
    );
  }
}
```

### 6.7 事業一覧 API

**src/app/api/v1/businesses/route.ts**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withApiAuth } from '@/lib/api-handler';

export const GET = withApiAuth(async (_request, { session }) => {
  const { id: userId, role } = session.user;

  const businesses =
    role === 'admin'
      ? await prisma.business.findMany({
          where: { businessIsActive: true },
          orderBy: { businessSortOrder: 'asc' },
          select: {
            id: true,
            businessCode: true,
            businessName: true,
            businessProjectPrefix: true,
            businessSortOrder: true,
          },
        })
      : await prisma.business.findMany({
          where: {
            businessIsActive: true,
            userAssignments: { some: { userId } },
          },
          orderBy: { businessSortOrder: 'asc' },
          select: {
            id: true,
            businessCode: true,
            businessName: true,
            businessProjectPrefix: true,
            businessSortOrder: true,
          },
        });

  return NextResponse.json({ success: true, data: businesses });
});

// NextResponseのインポートが必要
import { NextResponse } from 'next/server';
```

> **旧設計からの改善**:
> - `withApiAuth` ラッパーで認証チェック+エラーハンドリングを共通化（各APIルートでのボイラープレート削減）
> - `select` を使用して必要なフィールドのみ取得（不要なデータ転送を防止）
> - staff/partnerの事業取得を `where: { userAssignments: { some: { userId } } }` で1クエリに最適化（旧設計は2クエリ必要だった）

---

## 7. 型定義

### 7.1 設定オブジェクト型

**src/types/config.ts**

02_COMPONENT_DESIGN.md に定義された型をそのまま使用する。Phase 0で必要な最小限の型のみ定義し、Phase 1以降で段階的に拡張する。

```typescript
import { ReactNode } from 'react';

// ============================================
// 共通型
// ============================================

export type ColumnDef = {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode;
  defaultVisible?: boolean;
  locked?: boolean;
};

export type FilterDef = {
  key: string;
  label: string;
  type: 'select' | 'date' | 'month' | 'daterange';
  options?: { value: string; label: string }[];
  optionsEndpoint?: string;
};

// ============================================
// EntityListConfig
// ============================================

export type EntityListConfig = {
  entityType: string;
  apiEndpoint: string;
  title: string;
  columns: ColumnDef[];
  search: {
    placeholder: string;
    fields: string[];
    debounceMs?: number;
  };
  filters: FilterDef[];
  defaultSort: {
    field: string;
    direction: 'asc' | 'desc';
  };
  tableSettings: {
    persistKey: string;
    defaultPageSize: 10 | 25 | 50 | 100;
    defaultDensity: 'compact' | 'normal' | 'comfortable';
    columnReorderEnabled: boolean;
    columnToggleEnabled: boolean;
  };
  detailPath: (id: number) => string;
  createPath: string;
  businessScoped?: boolean;
  permissions?: {
    hideCreateButton?: string[];
  };
};

// ============================================
// EntityDetailConfig
// ============================================

export type EntityDetailConfig = {
  entityType: string;
  apiEndpoint: (id: string) => string;
  title: (data: Record<string, unknown>) => string;
  tabs: TabDef[];
  actions: {
    edit: boolean;
    delete: boolean;
  };
};

export type TabDef = {
  key: string;
  label: string;
  component: 'info' | 'related' | 'contacts' | 'files' | 'custom';
  config: InfoTabConfig | RelatedTabConfig | Record<string, unknown>;
};

export type InfoTabConfig = {
  sections: {
    title: string;
    columns?: 1 | 2;
    fields: FieldDisplayDef[];
  }[];
};

export type FieldDisplayDef = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'currency' | 'date' | 'email' | 'phone' | 'status' | 'boolean';
  colSpan?: 1 | 2;
  render?: (value: unknown, data: Record<string, unknown>) => ReactNode;
};

export type RelatedTabConfig = {
  apiEndpoint: (parentId: string) => string;
  columns: ColumnDef[];
  detailPath?: (id: number) => string;
  showCount?: boolean;
};

// ============================================
// EntityFormConfig
// ============================================

export type EntityFormConfig = {
  entityType: string;
  apiEndpoint: string;
  title: { create: string; edit: string };
  sections: FormSectionDef[];
  validationSchema: unknown; // Zod schema
  redirectAfterSave: (id: number) => string;
  warnOnLeave?: boolean;
};

export type FormSectionDef = {
  title: string;
  columns?: 1 | 2 | 3;
  fields: FormFieldDef[];
};

export type FormFieldDef = {
  key: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'select'
    | 'date'
    | 'month'
    | 'textarea'
    | 'email'
    | 'phone'
    | 'checkbox'
    | 'readonly';
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  options?: { value: string; label: string }[];
  optionsEndpoint?: string;
  colSpan?: 1 | 2 | 3;
};
```

> **設計判断**: 02_COMPONENT_DESIGN.md の完全な型定義（ComputedFieldDef, CascadeRule, ChildEntityDef等）はPhase 1以降で追加する。Phase 0では基本的なList/Detail/Form の型のみ定義し、テンプレートの動作検証に集中する。

---

## 8. 共通フック実装

### 8.1 useDebounce

**src/hooks/use-debounce.ts**

```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

### 8.2 useBusiness

**src/hooks/use-business.ts**

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/api-client';

interface Business {
  id: number;
  businessCode: string;
  businessName: string;
}

// 選択状態の永続化ストア
interface BusinessStore {
  selectedId: number | null;
  setSelectedId: (id: number) => void;
}

const useBusinessStore = create<BusinessStore>()(
  persist(
    (set) => ({
      selectedId: null,
      setSelectedId: (id) => set({ selectedId: id }),
    }),
    { name: 'business-selection' },
  ),
);

export function useBusiness() {
  const { selectedId, setSelectedId } = useBusinessStore();

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['businesses'],
    queryFn: async () => {
      const result = await apiClient.getList<Business>('/businesses');
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
  });

  // 選択中の事業（未選択の場合は一覧の先頭をデフォルト）
  const currentBusiness =
    businesses.find((b) => b.id === selectedId) ?? businesses[0] ?? null;

  // 初回ロード時にデフォルト選択
  if (businesses.length > 0 && selectedId === null) {
    setSelectedId(businesses[0].id);
  }

  const switchBusiness = (businessId: number) => {
    setSelectedId(businessId);
  };

  return {
    currentBusiness,
    businesses,
    switchBusiness,
    isLoading,
  };
}
```

> **旧設計からの改善**:
> - `staleTime` を設定（事業マスタは頻繁に変わらないため5分キャッシュ）
> - 初回ロード時のデフォルト選択ロジックを追加

### 8.3 useToast

**src/hooks/use-toast.ts**

```typescript
'use client';

import { create } from 'zustand';
import { useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: ToastItem[];
  add: (toast: ToastItem) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => set((s) => ({ toasts: [...s.toasts, toast] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

let counter = 0;

export function useToast() {
  const { add, remove, clear } = useToastStore();

  const toast = useCallback(
    (options: { title?: string; message: string; type: ToastType; duration?: number }) => {
      const id = `toast-${++counter}`;
      add({ id, title: options.title, message: options.message, type: options.type });

      const duration = options.duration ?? 5000;
      if (duration > 0) {
        setTimeout(() => remove(id), duration);
      }
    },
    [add, remove],
  );

  return { toast, dismiss: remove, dismissAll: clear };
}
```

> **旧設計からの改善**:
> - `useToastStore` をexportし、Toast表示コンポーネントから直接購読可能に
> - IDにカウンターを使用（`Math.random().toString(36)` より衝突リスクが低い）

### 8.4 useEntityList

**src/hooks/use-entity-list.ts**

```typescript
'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { EntityListConfig } from '@/types/config';
import { useDebounce } from './use-debounce';

export function useEntityList(config: EntityListConfig) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL → State 初期化
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [pageSize, setPageSize] = useState(
    Number(searchParams.get('pageSize')) || config.tableSettings.defaultPageSize,
  );
  const [searchQuery, setSearchQueryRaw] = useState(searchParams.get('search') || '');
  const [filters, setFiltersState] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState(
    searchParams.get('sortField') || config.defaultSort.field,
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    (searchParams.get('sortDirection') as 'asc' | 'desc') || config.defaultSort.direction,
  );

  const debouncedSearch = useDebounce(searchQuery, config.search.debounceMs ?? 300);

  // State → URL 同期
  const syncURL = useCallback(
    (overrides: Record<string, string | undefined> = {}) => {
      const params = new URLSearchParams();
      const values: Record<string, string | undefined> = {
        page: page > 1 ? String(page) : undefined,
        pageSize: pageSize !== config.tableSettings.defaultPageSize ? String(pageSize) : undefined,
        search: debouncedSearch || undefined,
        sortField: sortField !== config.defaultSort.field ? sortField : undefined,
        sortDirection: sortDirection !== config.defaultSort.direction ? sortDirection : undefined,
        ...overrides,
      };

      for (const [key, value] of Object.entries(values)) {
        if (value) params.set(key, value);
      }

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [page, pageSize, debouncedSearch, sortField, sortDirection, pathname, router, config],
  );

  // TanStack Query
  const queryKey = useMemo(
    () => [config.apiEndpoint, page, pageSize, debouncedSearch, sortField, sortDirection, filters],
    [config.apiEndpoint, page, pageSize, debouncedSearch, sortField, sortDirection, filters],
  );

  const { data: queryResult, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      apiClient.getList(config.apiEndpoint, {
        page,
        pageSize,
        search: debouncedSearch,
        sortField,
        sortDirection,
        filters,
      }),
    placeholderData: keepPreviousData,
  });

  // ページ変更
  const handleSetPage = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleSetPageSize = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  // 検索
  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQueryRaw(query);
    setPage(1);
  }, []);

  // フィルター
  const handleSetFilter = useCallback((key: string, value: string) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFiltersState({});
    setPage(1);
  }, []);

  // ソート
  const handleSetSort = useCallback(
    (field: string) => {
      if (field === sortField) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
      setPage(1);
    },
    [sortField],
  );

  return {
    data: queryResult?.data ?? [],
    loading: isLoading,
    error: error as Error | null,
    pagination: {
      currentPage: queryResult?.meta?.page ?? page,
      pageSize: queryResult?.meta?.pageSize ?? pageSize,
      total: queryResult?.meta?.total ?? 0,
      totalPages: queryResult?.meta?.totalPages ?? 1,
    },
    setPage: handleSetPage,
    setPageSize: handleSetPageSize,
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    filters,
    setFilter: handleSetFilter,
    clearFilters: handleClearFilters,
    sortConfig: { field: sortField, direction: sortDirection },
    setSort: handleSetSort,
    refresh: refetch,
  };
}
```

> **旧設計からの改善**:
> - `import { useState, useEffect, useMemo, useCallback } from 'use'` → 正しいインポート元 `'react'` に修正（旧設計にはバグがあった）
> - `keepPreviousData`（TanStack Query v5の正式API。旧設計の`keepPreviousData: true` はv4の構文）
> - URL同期を `useEffect` による自動同期ではなく、各操作時に明示的に呼び出す設計に変更（無限ループの防止）

### 8.5 useEntityDetail / useEntityForm

これらはPhase 0で型定義と基本的なスケルトンを作成し、Phase 1で本格実装する。

**src/hooks/use-entity-detail.ts**

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { EntityDetailConfig } from '@/types/config';

export function useEntityDetail(config: EntityDetailConfig, id: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [config.entityType, id],
    queryFn: () => apiClient.getById(config.apiEndpoint(id), id),
    enabled: !!id,
  });

  return {
    data: data ?? null,
    loading: isLoading,
    error: error as Error | null,
    refresh: refetch,
  };
}
```

**src/hooks/use-entity-form.ts**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from './use-toast';
import type { EntityFormConfig } from '@/types/config';

export function useEntityForm(config: EntityFormConfig, id?: string) {
  const router = useRouter();
  const { toast } = useToast();
  const mode = id ? 'edit' : 'create';

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // 編集モード：既存データ取得
  const { isLoading } = useQuery({
    queryKey: [config.entityType, id],
    queryFn: async () => {
      const data = await apiClient.getById<Record<string, unknown>>(config.apiEndpoint, id!);
      setFormData(data);
      return data;
    },
    enabled: mode === 'edit' && !!id,
  });

  const setField = useCallback((key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setIsDirty(true);
  }, []);

  const submit = useCallback(async () => {
    setIsSubmitting(true);
    setErrors({});

    try {
      // Zodバリデーション（Phase 1で本格実装）
      let result: { id: number };
      if (mode === 'create') {
        result = await apiClient.create<{ id: number }>(config.apiEndpoint, formData);
      } else {
        result = await apiClient.update<{ id: number }>(config.apiEndpoint, id!, formData);
      }

      toast({
        message: mode === 'create' ? '作成しました' : '更新しました',
        type: 'success',
      });

      router.push(config.redirectAfterSave(result.id));
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast({ message: error.message, type: 'error' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [mode, formData, config, id, toast, router]);

  const reset = useCallback(() => {
    setFormData({});
    setErrors({});
    setIsDirty(false);
  }, []);

  return {
    formData,
    setField,
    errors,
    submit,
    isSubmitting,
    mode: mode as 'create' | 'edit',
    isLoading,
    isDirty,
    reset,
  };
}
```

---

## 9. UIコンポーネント実装

### 9.1 shadcn/ui セットアップ

```bash
npx shadcn-ui@latest init
# framework: Next.js
# typescript: yes
# style: Default
# base color: Slate
# CSS variables: yes
# tailwind.config: tailwind.config.ts
# components: src/components/ui
# utils: src/lib/utils

# 基本コンポーネントのインストール
npx shadcn-ui@latest add button input label select dialog \
  dropdown-menu tabs card badge skeleton tooltip table separator
```

### 9.2 カスタムコンポーネント一覧

| コンポーネント | ファイル | 責務 |
|---|---|---|
| DataTable | `components/ui/data-table.tsx` | 汎用テーブル（ソート・行クリック対応） |
| Pagination | `components/ui/pagination.tsx` | ページネーションUI |
| StatusBadge | `components/ui/status-badge.tsx` | ステータスバッジ |
| EmptyState | `components/ui/empty-state.tsx` | 空状態表示 |
| LoadingSpinner | `components/ui/loading-spinner.tsx` | ローディング |
| ErrorDisplay | `components/ui/error-display.tsx` | エラー表示 + リトライ |
| ConfirmModal | `components/ui/confirm-modal.tsx` | 確認・削除モーダル |
| ToastContainer | `components/ui/toast-container.tsx` | トースト通知表示 |
| SearchInput | `components/form/search-input.tsx` | デバウンス付き検索 |
| FilterBar | `components/form/filter-bar.tsx` | フィルターバー |
| FormField | `components/form/form-field.tsx` | 汎用フォームフィールド |

### 9.3 DataTable

**src/components/ui/data-table.tsx**

テンプレートの核となる汎用テーブル。Phase 0ではソート・行クリック・基本表示に対応し、Phase 1でインライン編集・チェックボックス選択・列並び替え等を追加する。

```typescript
'use client';

import { cn } from '@/lib/utils';
import type { ColumnDef } from '@/types/config';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DataTableProps {
  columns: ColumnDef[];
  data: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
  sortConfig?: { field: string; direction: 'asc' | 'desc' };
  onSort?: (field: string) => void;
  loading?: boolean;
}

export function DataTable({
  columns,
  data,
  onRowClick,
  sortConfig,
  onSort,
  loading,
}: DataTableProps) {
  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.field !== columnKey) {
      return <ArrowUpDown className="ml-1 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="ml-1 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-1 h-4 w-4" />
    );
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                style={{ width: column.width, minWidth: column.minWidth }}
                className={cn(
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                  column.sortable && 'cursor-pointer select-none',
                )}
                onClick={() => column.sortable && onSort?.(column.key)}
              >
                <div className="flex items-center">
                  {column.label}
                  {column.sortable && getSortIcon(column.key)}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            // スケルトン行（5行分）
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            data.map((row, rowIndex) => (
              <TableRow
                key={(row.id as string | number) ?? rowIndex}
                className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                    )}
                  >
                    {column.render
                      ? column.render(row[column.key], row)
                      : (row[column.key] as React.ReactNode) ?? '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

> **Phase 1拡張ポイント**: `selectable`, `editingCell`, `onCellEdit`, `visibleColumns`, `columnOrder`, `density` propsを追加することでインライン編集・列カスタマイズ・一括選択に対応する。Props追加型のため既存コードへの破壊的変更なし。

### 9.4 Pagination

**src/components/ui/pagination.tsx**

```typescript
'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="text-sm text-muted-foreground">
        全{total}件中 {(currentPage - 1) * pageSize + 1}〜
        {Math.min(currentPage * pageSize, total)}件を表示
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">表示件数</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-3 text-sm">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### 9.5 StatusBadge

**src/components/ui/status-badge.tsx**

```typescript
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ステータス値 → 色のマッピング（Phase 1で事業設定から動的取得に拡張可能）
const DEFAULT_COLOR_MAP: Record<string, string> = {
  '1.購入済み': 'bg-green-100 text-green-800 border-green-300',
  '2.入金確定': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  '3.契約締結中': 'bg-orange-100 text-orange-800 border-orange-300',
  '4.Aヨミ(申請中)': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '5.Bヨミ': 'bg-blue-100 text-blue-800 border-blue-300',
  '6.アポ中': 'bg-slate-100 text-slate-800 border-slate-300',
  '7.失注': 'bg-red-100 text-red-800 border-red-300',
  '確認済み': 'bg-green-100 text-green-800 border-green-300',
  '未確認': 'bg-gray-100 text-gray-800 border-gray-300',
  '確認中': 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

interface StatusBadgeProps {
  status: string;
  colorMap?: Record<string, string>;
}

export function StatusBadge({ status, colorMap }: StatusBadgeProps) {
  const colors = colorMap ?? DEFAULT_COLOR_MAP;
  const colorClass = colors[status] ?? 'bg-gray-100 text-gray-800 border-gray-300';

  return (
    <Badge variant="outline" className={cn('font-normal', colorClass)}>
      {status}
    </Badge>
  );
}
```

### 9.6 EmptyState

**src/components/ui/empty-state.tsx**

```typescript
import { InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  title = 'データがありません',
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon ?? <InboxIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />}
      <h3 className="text-lg font-medium">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

### 9.7 LoadingSpinner

**src/components/ui/loading-spinner.tsx**

```typescript
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export function LoadingSpinner({ className, size = 'md', message }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <Loader2 className={cn('animate-spin text-muted-foreground', sizeMap[size])} />
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
```

### 9.8 SearchInput

**src/components/form/search-input.tsx**

```typescript
'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = '検索...' }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
```

> **注意**: SearchInput自体はデバウンスしない。デバウンスはuseEntityList内のuseDebounceフックが担う（関心の分離）。

### 9.9 FilterBar

**src/components/form/filter-bar.tsx**

```typescript
'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import type { FilterDef } from '@/types/config';

interface FilterBarProps {
  filters: FilterDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

export function FilterBar({ filters, values, onChange, onClear }: FilterBarProps) {
  const activeCount = Object.values(values).filter(Boolean).length;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {filters.map((filter) => (
        <div key={filter.key} className="w-48">
          <Select
            value={values[filter.key] ?? ''}
            onValueChange={(v) => onChange(filter.key, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全て</SelectItem>
              {filter.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1 h-4 w-4" />
          フィルターをクリア
        </Button>
      )}
    </div>
  );
}
```

> **Phase 1拡張ポイント**: `optionsEndpoint` を持つFilterDefは、useQueryで動的に選択肢を取得する。Phase 0ではstatic optionsのみ対応。

### 9.10 FormField

**src/components/form/form-field.tsx**

PRD 3.4で最も重要な共通コンポーネント。フィールド型に応じた入力コンポーネントの自動切り替えを行う。

```typescript
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { FormFieldDef } from '@/types/config';

interface FormFieldProps {
  field: FormFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

export function FormField({ field, value, onChange, error }: FormFieldProps) {
  const id = `field-${field.key}`;

  return (
    <div className={cn('space-y-2', field.colSpan === 2 && 'col-span-2', field.colSpan === 3 && 'col-span-3')}>
      <Label htmlFor={id} className={cn(error && 'text-destructive')}>
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {renderInput(field, id, value, onChange)}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function renderInput(
  field: FormFieldDef,
  id: string,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  const strValue = (value as string) ?? '';

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
      return (
        <Input
          id={id}
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={field.disabled === true}
        />
      );

    case 'number':
      return (
        <Input
          id={id}
          type="number"
          value={value != null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={field.placeholder}
          disabled={field.disabled === true}
        />
      );

    case 'textarea':
      return (
        <Textarea
          id={id}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={field.disabled === true}
          rows={4}
        />
      );

    case 'select':
      return (
        <Select
          value={strValue}
          onValueChange={(v) => onChange(v)}
          disabled={field.disabled === true}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder={field.placeholder ?? '選択してください'} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'date':
      return (
        <Input
          id={id}
          type="date"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled === true}
        />
      );

    case 'month':
      return (
        <Input
          id={id}
          type="month"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled === true}
        />
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={field.disabled === true}
          />
        </div>
      );

    case 'readonly':
      return (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">
          {strValue || '-'}
        </div>
      );

    default:
      return (
        <Input
          id={id}
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
```

> **設計判断**: FormFieldは `field.type` によるswitch分岐で入力コンポーネントを切り替える。Phase 1で `entity_search`, `postal_code`, `currency`, `file_upload` 型を追加する際は、switch caseを追加するだけで対応可能。
>
> **Phase 1拡張ポイント**: `optionsEndpoint` を持つselectフィールドは、FormField内部でuseQueryを使い動的に選択肢を取得する。Phase 0ではstatic options のみ。

### 9.12 ErrorDisplay

**src/components/ui/error-display.tsx**

```typescript
'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorDisplay({
  message = 'データの読み込みに失敗しました',
  onRetry,
}: ErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          再試行
        </Button>
      )}
    </div>
  );
}
```

### 9.13 ToastContainer

**src/components/ui/toast-container.tsx**

```typescript
'use client';

import { useToastStore, type ToastType } from '@/hooks/use-toast';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styleMap: Record<ToastType, string> = {
  success: 'border-green-500 bg-green-50 text-green-800',
  error: 'border-destructive bg-destructive/10 text-destructive',
  warning: 'border-yellow-500 bg-yellow-50 text-yellow-800',
  info: 'border-blue-500 bg-blue-50 text-blue-800',
};

export function ToastContainer() {
  const { toasts, remove } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-96">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4 shadow-lg animate-in slide-in-from-right',
              styleMap[toast.type],
            )}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              {toast.title && <p className="font-semibold text-sm">{toast.title}</p>}
              <p className="text-sm">{toast.message}</p>
            </div>
            <button onClick={() => remove(toast.id)} className="shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

### 9.14 ConfirmModal

**src/components/ui/confirm-modal.tsx**

```typescript
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '確認',
  variant = 'default',
  onConfirm,
  isLoading,
}: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            キャンセル
          </Button>
          <Button variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? '処理中...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 10. レイアウト実装

### 10.1 ナビゲーション定義

**src/config/navigation.ts**

```typescript
import { LayoutDashboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Phase 0ではダッシュボードのみ。Phase 1以降で顧客・代理店・案件を追加
export const mainNavItems: NavItem[] = [
  { label: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
];
```

### 10.2 PageHeader（パンくずリスト対応）

**src/components/layout/page-header.tsx**

PRD 3.4でパンくずリストを含むと明記されている。Phase 0でパンくずの型とレンダリングを実装し、Phase 1のエンティティ画面でそのまま利用する。

```typescript
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface Breadcrumb {
  label: string;
  href?: string; // 省略時はテキストのみ（現在のページ）
}

interface PageHeaderProps {
  title: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

export function PageHeader({ title, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="space-y-1">
      {/* パンくずリスト */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3 w-3" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* タイトル + アクションボタン */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
```

> **Phase 1での使用例**:
> ```typescript
> <PageHeader
>   title="顧客詳細"
>   breadcrumbs={[
>     { label: 'ダッシュボード', href: '/dashboard' },
>     { label: '顧客一覧', href: '/customers' },
>     { label: customer.customerName },
>   ]}
>   actions={<Button>編集</Button>}
> />
> ```

### 10.3 Sidebar

**src/components/layout/sidebar.tsx**

折りたたみ対応のサイドバー。展開時 w-64 / 折りたたみ時 w-16 をトグルボタンで切り替え。
状態は `localStorage('sidebar-collapsed')` に保存し、ページ遷移後も維持される。
折りたたみ時はアイコンのみ表示し、ホバーでラベルをツールチップ表示する。

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { mainNavItems } from '@/config/navigation';
import { BusinessSwitcher } from './business-switcher';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* トグルボタン */}
      <button
        onClick={toggle}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-card shadow-sm hover:bg-muted transition-colors"
        aria-label={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {/* ロゴ / システム名 */}
      <div className={cn('border-b overflow-hidden', collapsed ? 'p-4' : 'p-6')}>
        {collapsed ? (
          <span className="text-lg font-bold">M</span>
        ) : (
          <h1 className="text-lg font-bold whitespace-nowrap">M2管理システム</h1>
        )}
      </div>

      {/* 事業切り替え（展開時のみ表示） */}
      {!collapsed && (
        <div className="px-3 py-4 border-b">
          <BusinessSwitcher />
        </div>
      )}

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {mainNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <div key={item.href} className="relative group">
              <Link
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center gap-0' : 'gap-3',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
              {/* 折りたたみ時のツールチップ */}
              {collapsed && (
                <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-sm shadow-md border opacity-0 group-hover:opacity-100 transition-opacity z-50">
                  {item.label}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ユーザー情報 + ログアウト */}
      <div className="border-t p-3">
        {collapsed ? (
          <div className="flex justify-center">
            <Button variant="ghost" size="icon" onClick={signOut} title="ログアウト">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="truncate">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} title="ログアウト">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
```

### 10.4 BusinessSwitcher

**src/components/layout/business-switcher.tsx**

```typescript
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBusiness } from '@/hooks/use-business';
import { Building2 } from 'lucide-react';

export function BusinessSwitcher() {
  const { currentBusiness, businesses, switchBusiness, isLoading } = useBusiness();

  if (isLoading || businesses.length === 0) {
    return null;
  }

  return (
    <Select
      value={currentBusiness?.id?.toString() ?? ''}
      onValueChange={(value) => switchBusiness(Number(value))}
    >
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="事業を選択" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {businesses.map((business) => (
          <SelectItem key={business.id} value={business.id.toString()}>
            {business.businessName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### 10.5 Header

**src/components/layout/header.tsx**

```typescript
'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

export function Header() {
  const { user } = useAuth();

  return (
    <header className="flex h-14 items-center justify-end gap-4 border-b px-6">
      {/* 通知ベル（Phase 0ではプレースホルダー） */}
      <Button variant="ghost" size="icon" title="通知" disabled>
        <Bell className="h-5 w-5" />
      </Button>

      <span className="text-sm text-muted-foreground">{user?.name}</span>
    </header>
  );
}
```

### 10.6 AuthLayout

**src/app/(auth)/layout.tsx**

```typescript
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

### 10.7 PortalLayout

**src/app/(partner)/layout.tsx**

```typescript
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-bold">代理店ポータル</h1>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
```

---

## 11. テンプレート画面実装

### 11.1 EntityListTemplate

**src/components/templates/entity-list-template.tsx**

```typescript
'use client';

import { useRouter } from 'next/navigation';
import type { EntityListConfig } from '@/types/config';
import { useEntityList } from '@/hooks/use-entity-list';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/form/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorDisplay } from '@/components/ui/error-display';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface EntityListTemplateProps {
  config: EntityListConfig;
}

export function EntityListTemplate({ config }: EntityListTemplateProps) {
  const router = useRouter();
  const { hasRole } = useAuth();

  const {
    data,
    loading,
    error,
    pagination,
    setPage,
    setPageSize,
    searchQuery,
    setSearchQuery,
    sortConfig,
    setSort,
    refresh,
  } = useEntityList(config);

  // 権限による新規作成ボタンの制御
  const hideCreate = config.permissions?.hideCreateButton?.some((role) =>
    hasRole(role as any),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={config.title}
        actions={
          !hideCreate && (
            <Button onClick={() => router.push(config.createPath)}>
              <Plus className="mr-2 h-4 w-4" />
              新規作成
            </Button>
          )
        }
      />

      <div className="flex items-center gap-4">
        <div className="w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={config.search.placeholder}
          />
        </div>
        {/* FilterBar はPhase 1で実装 */}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorDisplay message={error.message} onRetry={refresh} />
      ) : data.length === 0 ? (
        <EmptyState
          title="データがありません"
          description="条件を変更するか、新しいデータを登録してください"
          action={
            !hideCreate
              ? { label: '新規作成', onClick: () => router.push(config.createPath) }
              : undefined
          }
        />
      ) : (
        <>
          <DataTable
            columns={config.columns}
            data={data}
            onRowClick={(row) => router.push(config.detailPath(row.id as number))}
            sortConfig={sortConfig}
            onSort={setSort}
          />
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </div>
  );
}
```

> **旧設計からの改善**:
> - `ErrorDisplay` コンポーネントの使用（旧設計は生のdivでエラー表示）
> - `refresh` をリトライとして `ErrorDisplay` に渡す
> - `permissions.hideCreateButton` による権限制御を追加
> - SearchInputの幅を固定（`w-80`）してレイアウト崩れを防止

### 11.2 EntityDetailTemplate

**src/components/templates/entity-detail-template.tsx**

Phase 0ではタブ切り替え・基本情報表示・アクションボタンを実装。Phase 1でrelatedData遅延読み込み・warnings表示等を追加する。

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EntityDetailConfig, InfoTabConfig } from '@/types/config';
import { useEntityDetail } from '@/hooks/use-entity-detail';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface EntityDetailTemplateProps {
  config: EntityDetailConfig;
  id: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function EntityDetailTemplate({ config, id, breadcrumbs }: EntityDetailTemplateProps) {
  const router = useRouter();
  const { canEdit, canDelete } = useAuth();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useEntityDetail(config, id);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activeTab, setActiveTab] = useState(config.tabs[0]?.key ?? '');

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error.message} onRetry={refresh} />;
  if (!data) return <ErrorDisplay message="データが見つかりません" />;

  const title = config.title(data as Record<string, unknown>);

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            {config.actions.edit && canEdit && (
              <Button
                variant="outline"
                onClick={() => router.push(`/${config.entityType}s/${id}/edit`)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                編集
              </Button>
            )}
            {config.actions.delete && canDelete && (
              <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                削除
              </Button>
            )}
          </div>
        }
      />

      {/* タブ */}
      {config.tabs.length > 1 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {config.tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {config.tabs.map((tab) => (
            <TabsContent key={tab.key} value={tab.key}>
              {tab.component === 'info' && (
                <InfoTabContent
                  config={tab.config as InfoTabConfig}
                  data={data as Record<string, unknown>}
                />
              )}
              {tab.component === 'related' && (
                <div className="text-muted-foreground text-sm py-8 text-center">
                  関連データはPhase 1で実装
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        config.tabs[0]?.component === 'info' && (
          <InfoTabContent
            config={config.tabs[0].config as InfoTabConfig}
            data={data as Record<string, unknown>}
          />
        )
      )}

      {/* 削除確認モーダル */}
      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="データを削除しますか？"
        description="この操作は元に戻せません。"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={async () => {
          try {
            await fetch(`/api/v1/${config.entityType}s/${id}`, { method: 'DELETE' });
            toast({ message: '削除しました', type: 'success' });
            router.push(`/${config.entityType}s`);
          } catch {
            toast({ message: '削除に失敗しました', type: 'error' });
          }
          setShowDeleteModal(false);
        }}
      />
    </div>
  );
}

/** 基本情報タブの表示 */
function InfoTabContent({
  config,
  data,
}: {
  config: InfoTabConfig;
  data: Record<string, unknown>;
}) {
  return (
    <div className="space-y-6">
      {config.sections.map((section, i) => (
        <div key={i} className="rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">{section.title}</h3>
          <dl
            className={`grid gap-4 ${
              section.columns === 2 ? 'grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {section.fields.map((field) => (
              <div
                key={field.key}
                className={field.colSpan === 2 ? 'col-span-2' : ''}
              >
                <dt className="text-sm text-muted-foreground">{field.label}</dt>
                <dd className="mt-1 text-sm font-medium">
                  {field.render
                    ? field.render(data[field.key], data)
                    : formatFieldValue(data[field.key], field.type)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function formatFieldValue(value: unknown, type?: string): string {
  if (value == null) return '-';
  switch (type) {
    case 'currency':
      return formatCurrency(value as number);
    case 'date':
      return formatDate(value as string);
    case 'boolean':
      return value ? 'はい' : 'いいえ';
    default:
      return String(value);
  }
}
```

### 11.3 EntityFormTemplate

**src/components/templates/entity-form-template.tsx**

```typescript
'use client';

import { useRouter } from 'next/navigation';
import type { EntityFormConfig } from '@/types/config';
import { useEntityForm } from '@/hooks/use-entity-form';
import { PageHeader } from '@/components/layout/page-header';
import { FormField } from '@/components/form/form-field';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Save, ArrowLeft } from 'lucide-react';

interface EntityFormTemplateProps {
  config: EntityFormConfig;
  id?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function EntityFormTemplate({ config, id, breadcrumbs }: EntityFormTemplateProps) {
  const router = useRouter();
  const {
    formData,
    setField,
    errors,
    submit,
    isSubmitting,
    mode,
    isLoading,
    isDirty,
  } = useEntityForm(config, id);

  if (isLoading) return <LoadingSpinner />;

  const title = mode === 'create' ? config.title.create : config.title.edit;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              戻る
            </Button>
            <Button
              onClick={submit}
              disabled={isSubmitting || !isDirty}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? '保存中...' : '保存'}
            </Button>
          </div>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-8"
      >
        {config.sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="rounded-lg border p-6">
            <h3 className="text-lg font-semibold mb-4">{section.title}</h3>
            <div
              className={`grid gap-4 ${
                section.columns === 3
                  ? 'grid-cols-3'
                  : section.columns === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1'
              }`}
            >
              {section.fields.map((field) => (
                <FormField
                  key={field.key}
                  field={field}
                  value={formData[field.key]}
                  onChange={(value) => setField(field.key, value)}
                  error={errors[field.key]}
                />
              ))}
            </div>
          </div>
        ))}
      </form>
    </div>
  );
}
```

> **Phase 1拡張ポイント**:
> - `config.computedFields` があれば `setField` 内で自動再計算を発火
> - `config.cascadeRules` があれば連動クリアを発火
> - `config.childEntities` があればChildEntityListコンポーネントを各セクション末尾に表示
> - `config.warnOnLeave` が true のとき `beforeunload` + Next.js Router イベントで離脱警告

### 11.4 ダミー設定（動作検証用）

**src/config/entities/_sample.ts**

US-004（設定オブジェクトによる画面追加）の受け入れ基準を検証するためのダミー設定。3テンプレート全てを動作確認する。

```typescript
import { z } from 'zod';
import type { EntityListConfig, EntityDetailConfig, EntityFormConfig } from '@/types/config';

// ============================================
// 一覧画面ダミー設定
// ============================================
export const sampleListConfig: EntityListConfig = {
  entityType: 'sample',
  apiEndpoint: '/api/v1/samples',
  title: 'サンプル一覧',
  columns: [
    { key: 'id', label: 'ID', width: 80, sortable: true, locked: true },
    { key: 'name', label: '名前', width: 200, sortable: true, locked: true },
    { key: 'status', label: 'ステータス', width: 120 },
    { key: 'amount', label: '金額', width: 120, align: 'right' },
    { key: 'createdAt', label: '作成日', width: 120, sortable: true },
  ],
  search: {
    placeholder: 'ID、名前で検索',
    fields: ['id', 'name'],
  },
  filters: [
    {
      key: 'status',
      label: 'ステータス',
      type: 'select',
      options: [
        { value: 'active', label: '有効' },
        { value: 'inactive', label: '無効' },
      ],
    },
  ],
  defaultSort: { field: 'id', direction: 'desc' },
  tableSettings: {
    persistKey: 'sample_list',
    defaultPageSize: 25,
    defaultDensity: 'normal',
    columnReorderEnabled: false,
    columnToggleEnabled: false,
  },
  detailPath: (id) => `/samples/${id}`,
  createPath: '/samples/new',
};

// ============================================
// 詳細画面ダミー設定
// ============================================
export const sampleDetailConfig: EntityDetailConfig = {
  entityType: 'sample',
  apiEndpoint: (id) => `/api/v1/samples/${id}`,
  title: (data) => `サンプル: ${data.name ?? ''}`,
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
              { key: 'id', label: 'ID' },
              { key: 'name', label: '名前' },
              { key: 'status', label: 'ステータス', type: 'status' },
              { key: 'amount', label: '金額', type: 'currency' },
              { key: 'description', label: '説明', colSpan: 2 },
              { key: 'createdAt', label: '作成日', type: 'date' },
            ],
          },
        ],
      },
    },
  ],
  actions: { edit: true, delete: true },
};

// ============================================
// フォーム画面ダミー設定
// ============================================
const sampleValidationSchema = z.object({
  name: z.string().min(1, '名前は必須です'),
  status: z.string().min(1, 'ステータスは必須です'),
  amount: z.number().min(0, '金額は0以上で入力してください').nullable(),
  description: z.string().optional(),
});

export const sampleFormConfig: EntityFormConfig = {
  entityType: 'sample',
  apiEndpoint: '/api/v1/samples',
  title: { create: 'サンプル 新規作成', edit: 'サンプル 編集' },
  sections: [
    {
      title: '基本情報',
      columns: 2,
      fields: [
        { key: 'name', label: '名前', type: 'text', required: true, placeholder: '名前を入力' },
        {
          key: 'status',
          label: 'ステータス',
          type: 'select',
          required: true,
          options: [
            { value: 'active', label: '有効' },
            { value: 'inactive', label: '無効' },
          ],
        },
        { key: 'amount', label: '金額', type: 'number', placeholder: '0' },
        { key: 'email', label: 'メールアドレス', type: 'email', placeholder: 'example@example.com' },
      ],
    },
    {
      title: '詳細情報',
      columns: 1,
      fields: [
        { key: 'description', label: '説明', type: 'textarea', placeholder: '説明を入力', colSpan: 1 },
      ],
    },
  ],
  validationSchema: sampleValidationSchema,
  redirectAfterSave: (id) => `/samples/${id}`,
};
```

**動作検証用のダミーAPIルート**

**src/app/api/v1/samples/route.ts**

```typescript
import { NextResponse } from 'next/server';

// Phase 0の動作検証用。Phase 1で削除する。
const DUMMY_DATA = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  name: `サンプル ${i + 1}`,
  status: i % 3 === 0 ? 'inactive' : 'active',
  amount: Math.floor(Math.random() * 1000000),
  description: `サンプルデータ ${i + 1} の説明`,
  email: `sample${i + 1}@example.com`,
  createdAt: new Date(2024, 0, i + 1).toISOString(),
}));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || 25;
  const search = searchParams.get('search') || '';

  let filtered = DUMMY_DATA;
  if (search) {
    filtered = filtered.filter(
      (d) =>
        d.name.includes(search) || String(d.id).includes(search),
    );
  }

  const total = filtered.length;
  const data = filtered.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    success: true,
    data,
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
}
```

---

## 12. 画面実装

### 12.1 ルートページ

**src/app/page.tsx**

```typescript
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/login');
}
```

### 12.2 ダッシュボード

**src/app/(auth)/dashboard/page.tsx**

```typescript
import { PageHeader } from '@/components/layout/page-header';

export default function DashboardPage() {
  return (
    <div>
      <PageHeader title="ダッシュボード" />
      <div className="mt-6 rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          ダッシュボードの内容はPhase 1以降で実装します。
        </p>
      </div>
    </div>
  );
}
```

### 12.3 ダミーサンプル画面（US-004検証用）

**src/app/(auth)/samples/page.tsx**

```typescript
'use client';

import { Suspense } from 'react';
import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { sampleListConfig } from '@/config/entities/_sample';

export default function SampleListPage() {
  return (
    <Suspense fallback={null}>
      <EntityListTemplate config={sampleListConfig} />
    </Suspense>
  );
}
```

> **注意**: このページはPhase 0のUS-004受け入れ基準検証用。Phase 1で実エンティティ画面に置き換え後、削除する。ナビゲーション（`navigation.ts`）にも一時的に追加して検証する。

### 12.4 ポータル

**src/app/(partner)/portal/page.tsx**

```typescript
export default function PortalPage() {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <h2 className="text-xl font-bold mb-2">代理店ポータル</h2>
      <p className="text-muted-foreground">
        ポータルの内容はPhase 1以降で実装します。
      </p>
    </div>
  );
}
```

---

## 13. エラーハンドリング

### 13.1 グローバルエラーバウンダリ

**src/app/error.tsx**

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-bold mb-2">エラーが発生しました</h2>
      <p className="text-muted-foreground mb-6">
        ページの表示中にエラーが発生しました。
      </p>
      <Button onClick={reset}>再試行</Button>
    </div>
  );
}
```

### 13.2 404ページ

**src/app/not-found.tsx**

```typescript
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2 className="text-4xl font-bold mb-2">404</h2>
      <p className="text-muted-foreground mb-6">ページが見つかりません</p>
      <Button asChild>
        <Link href="/dashboard">ダッシュボードに戻る</Link>
      </Button>
    </div>
  );
}
```

---

## 14. Providers構成

**src/providers/index.tsx**

```typescript
'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ToastContainer } from '@/components/ui/toast-container';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,       // 1分間はキャッシュ利用
            retry: 1,                    // 失敗時1回だけリトライ
            refetchOnWindowFocus: false,  // タブ切替時の再取得無効
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <ToastContainer />
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

**src/app/layout.tsx**

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'M2管理システム',
  description: '統合管理システム',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

> **旧設計からの改善**:
> - Providers構成がセクションとして独立（旧設計ではProvidersの配置が未記載で実装時に迷う原因になっていた）
> - QueryClientの設定を明示化（`staleTime`, `retry`, `refetchOnWindowFocus`）
> - ToastContainerの配置場所を明示

---

## 15. テスト計画

### 15.1 Phase 0 テスト方針

Phase 0では手動テストで受け入れ基準を検証する。自動テスト基盤（Jest + Testing Library）はPhase 1で導入する。

### 15.2 手動テストシナリオ

| # | カテゴリ | テスト項目 | 期待結果 |
|---|---|---|---|
| 1 | 環境 | `docker compose up -d` 実行 | PostgreSQLコンテナが起動 |
| 2 | 環境 | `npm run db:migrate` 実行 | マイグレーション成功 |
| 3 | 環境 | `npm run db:seed` 実行 | シードデータ投入 |
| 4 | 環境 | `npm run dev` → `http://localhost:3000` | ログイン画面表示 |
| 5 | 認証 | admin@example.com / admin123 でログイン | /dashboard にリダイレクト |
| 6 | 認証 | admin@example.com / wrong でログイン | エラーメッセージ表示 |
| 7 | 認証 | 未認証で /dashboard にアクセス | /login にリダイレクト |
| 8 | 認証 | partner-admin@example.com でログイン | /portal にリダイレクト |
| 9 | 認証 | partner_admin で /dashboard にアクセス | /portal にリダイレクト |
| 10 | 認証 | admin で /portal にアクセス | /dashboard にリダイレクト |
| 11 | 認証 | ログアウトボタン押下 | /login にリダイレクト |
| 12 | レイアウト | ダッシュボード表示 | サイドバー + ヘッダー + メイン表示 |
| 13 | レイアウト | サイドバーの「ダッシュボード」リンク | アクティブ状態で表示 |
| 14 | レイアウト | ヘッダーのユーザー名 | ログインユーザー名表示 |
| 15 | レイアウト | ヘッダーの通知ベルアイコン | プレースホルダーとして表示（disabled） |
| 16 | 事業切替 | BusinessSwitcherで事業一覧表示 | admin: 2事業表示 |
| 17 | 事業切替 | 事業を選択 | 選択した事業名が表示される |
| 18 | 事業切替 | ページ遷移後 | 選択した事業が保持される |
| 19 | API | GET /api/v1/health | 200 OK + healthy レスポンス |
| 20 | API | GET /api/v1/businesses（認証済み） | 事業一覧のJSON |
| 21 | API | GET /api/v1/businesses（未認証） | 401 Unauthorized |
| 22 | テンプレート | /samples にアクセス | サンプル一覧テーブルが50件表示 |
| 23 | テンプレート | サンプル一覧で検索入力 | デバウンス後にフィルタリングされる |
| 24 | テンプレート | サンプル一覧でソートクリック | 昇順/降順が切り替わる |
| 25 | テンプレート | サンプル一覧でページネーション操作 | 正しいページに遷移 |
| 26 | テンプレート | _sample.tsのcolumnsに列を追加 | テンプレート変更なしで列が追加される |
| 27 | コード品質 | `npm run type-check` | エラーゼロ |
| 28 | コード品質 | `npm run lint` | エラーゼロ |

---

## 16. 実装チェックリスト

### Phase 0 完了基準

PRD「1.2 完了条件」と「4. 受け入れ基準」に対応するチェックリスト。

```markdown
## 環境構築（PRD 4.1）
- [ ] docker compose up でPostgreSQLが起動する
- [ ] npx prisma migrate dev でマイグレーション実行
- [ ] npx prisma db seed でシードデータ投入
- [ ] http://localhost:3000 でアクセス可能

## 認証（PRD 4.2 / US-001）
- [ ] admin ユーザーでログイン可能
- [ ] ログイン失敗時にエラーメッセージ表示
- [ ] 未認証アクセス → /login リダイレクト
- [ ] 代理店ユーザーログイン → /portal 遷移
- [ ] ログアウト → /login 遷移

## レイアウトとナビゲーション（PRD 4.3 / US-001, US-002）
- [ ] サイドバーに「ダッシュボード」リンク表示
- [ ] BusinessSwitcher で事業一覧表示・選択可能
- [ ] 選択事業がページ遷移後も保持される
- [ ] ヘッダーにユーザー名 + 通知ベルアイコン表示
- [ ] 1280px幅で正常表示

## ルートガード（US-003）
- [ ] partner_admin/partner_staff が /(auth)/ → /portal リダイレクト
- [ ] admin/staff が /(partner)/ → /dashboard リダイレクト

## テンプレート動作（PRD 4.4 / US-004）
- [ ] ダミー EntityListConfig → テーブル表示
- [ ] ダミー EntityFormConfig → フォーム表示
- [ ] ダミー EntityDetailConfig → 詳細画面表示
- [ ] テーブルのソートが動作する
- [ ] ページネーションが動作する
- [ ] 検索入力がデバウンス付きで動作する

## コード品質（PRD 4.5）
- [ ] TypeScript 型エラーゼロ（tsc --noEmit）
- [ ] ESLint エラーゼロ
- [ ] 全コンポーネントの主要Propsに型定義あり
- [ ] types/config.ts に設定オブジェクト型が定義されている

## Phase 1 移行検証
- [ ] ダミー設定の変更のみで列の追加・削除ができる
- [ ] テンプレート内部コードの変更が不要
```

---

## 17. Phase 1 拡張ガイド

Phase 0の成果物は「設定ファイル + ページファイルのみで新しいエンティティ画面が動作する」土台である。本セクションでは、Phase 1で新エンティティ（顧客・代理店・案件）を追加する際の具体的手順と、共通基盤の拡張ポイントを記載する。

### 17.1 新エンティティ追加手順（Phase 1開発者向け）

新しいエンティティ「顧客」を追加する場合の手順:

```
1. Prisma スキーマにモデル追加
   prisma/schema.prisma → model Customer { ... }

2. 設定ファイル作成（ここが80%の作業）
   src/config/entities/customer.ts
   ├── customerListConfig: EntityListConfig
   ├── customerDetailConfig: EntityDetailConfig
   ├── customerFormConfig: EntityFormConfig
   └── customerValidationSchema: ZodSchema

3. ページファイル作成（テンプレートを呼び出すだけ）
   src/app/(auth)/customers/
   ├── page.tsx             → <EntityListTemplate config={customerListConfig} />
   ├── [id]/page.tsx        → <EntityDetailTemplate config={customerDetailConfig} id={id} />
   ├── [id]/edit/page.tsx   → <EntityFormTemplate config={customerFormConfig} id={id} />
   └── new/page.tsx         → <EntityFormTemplate config={customerFormConfig} />

4. APIルート作成
   src/app/api/v1/customers/
   ├── route.ts             → GET (一覧) / POST (作成) — withApiAuth使用
   └── [id]/route.ts        → GET / PUT / DELETE — withApiAuth使用

5. ナビゲーション追加
   src/config/navigation.ts → mainNavItemsに { label: '顧客', href: '/customers', icon: Users } を追加

6. 動作確認
```

> **重要**: テンプレート（EntityListTemplate, EntityDetailTemplate, EntityFormTemplate）やフック（useEntityList, useEntityDetail, useEntityForm）の内部コードを変更する必要はない。

### 17.2 ページファイルの実装パターン

```typescript
// src/app/(auth)/customers/page.tsx — 最小構成（設定のみ）
'use client';

import { EntityListTemplate } from '@/components/templates/entity-list-template';
import { customerListConfig } from '@/config/entities/customer';

export default function CustomerListPage() {
  return <EntityListTemplate config={customerListConfig} />;
}
```

```typescript
// src/app/(auth)/customers/[id]/page.tsx — パンくず付き
'use client';

import { EntityDetailTemplate } from '@/components/templates/entity-detail-template';
import { customerDetailConfig } from '@/config/entities/customer';

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return (
    <EntityDetailTemplate
      config={customerDetailConfig}
      id={params.id}
      breadcrumbs={[
        { label: 'ダッシュボード', href: '/dashboard' },
        { label: '顧客一覧', href: '/customers' },
        { label: '顧客詳細' },
      ]}
    />
  );
}
```

### 17.3 共通基盤のPhase 1拡張ポイント一覧

以下はPhase 0で意図的にスケルトン化した箇所と、Phase 1で追加する機能の対応表。

| Phase 0の現状 | Phase 1で追加 | 影響ファイル |
|---|---|---|
| `types/config.ts` に基本型のみ | `ComputedFieldDef`, `CascadeRule`, `ChildEntityDef`, `WarningRule` を追加 | `types/config.ts` |
| `FormFieldDef.type` に基本型のみ | `entity_search`, `postal_code`, `currency`, `file_upload` 型を追加 | `types/config.ts`, `form-field.tsx` |
| `FormField` で static options のみ | `optionsEndpoint` による動的選択肢取得（useQuery） | `form-field.tsx` |
| `EntityDetailConfig.actions` に custom なし | `custom?: ActionDef[]` を追加 | `types/config.ts`, `entity-detail-template.tsx` |
| `EntityDetailConfig` に warnings なし | `warnings?: WarningRule[]` を追加 → WarningBannerコンポーネント | `types/config.ts`, `entity-detail-template.tsx`, 新規 `warning-banner.tsx` |
| `useEntityDetail` がタブ管理なし | `activeTab`, `relatedData`, `relatedCounts` を追加 | `use-entity-detail.ts` |
| `useEntityForm` が基本submit のみ | computedFields自動計算、cascadeRules連動クリア、conflictError楽観的ロック | `use-entity-form.ts` |
| `DataTable` がソート・行クリックのみ | インライン編集、チェックボックス選択、列並び替え、density切り替え | `data-table.tsx` |
| `FilterBar` が static options のみ | `optionsEndpoint` 動的取得 + QuickFilterコンポーネント追加 | `filter-bar.tsx`, 新規 `quick-filter.tsx` |
| CSV操作なし | `useCSVOperations` フック + ImportModal/ExportButton | 新規ファイル群 |
| テーブル設定永続化なし | `useTableSettings` フック + TableSettingsModal | 新規ファイル群 |

### 17.4 型定義の段階的拡張方針

`types/config.ts` はPhase 0で基本型を定義済み。Phase 1以降はオプショナルプロパティとして追加するため、Phase 0のコードに破壊的変更を与えない。

```typescript
// Phase 1での EntityFormConfig 拡張例（既存プロパティは全てそのまま）
export type EntityFormConfig = {
  // ... Phase 0で定義済みのプロパティ（変更なし）
  entityType: string;
  apiEndpoint: string;
  title: { create: string; edit: string };
  sections: FormSectionDef[];
  validationSchema: unknown;
  redirectAfterSave: (id: number) => string;
  warnOnLeave?: boolean;

  // Phase 1で追加（全てoptional → 既存コードへの影響ゼロ）
  childEntities?: ChildEntityDef[];      // 子エンティティ管理
  computedFields?: ComputedFieldDef[];   // 自動計算
  cascadeRules?: CascadeRule[];          // 連動クリア
};
```

---

## 付録: 旧設計からの主要変更点サマリー

| # | カテゴリ | 旧設計の問題 | 改善内容 |
|---|---|---|---|
| 1 | **依存関係** | `bcrypt`（ネイティブモジュール） | `bcryptjs`（pure JS、ビルド安定） |
| 2 | **依存関係** | `next-auth ^5.0.0-beta.19` | `next-auth ^4.24.0`（安定版） |
| 3 | **型安全性** | NextAuth の Session/JWT 型が未拡張 | `types/auth.ts` で declare module 拡張 |
| 4 | **型安全性** | `any` の多用 | `unknown` + 型ガードに置換 |
| 5 | **バグ** | `import from 'use'`（存在しないモジュール） | `import from 'react'` に修正 |
| 6 | **バグ** | TanStack Query v5で `keepPreviousData: true` | `placeholderData: keepPreviousData` |
| 7 | **セキュリティ** | authorize()のthrow Error（エラーメッセージリーク） | return null に変更 |
| 8 | **セキュリティ** | ログイン失敗時の詳細エラー表示 | 統一メッセージに変更 |
| 9 | **アーキテクチャ** | Providers構成が未記載 | 独立セクションとして追加 |
| 10 | **アーキテクチャ** | API ルートラッパー未定義 | `withApiAuth` を追加 |
| 11 | **アーキテクチャ** | フロントエンドエラー型が未定義 | `ApiClientError` クラスを追加 |
| 12 | **アーキテクチャ** | Route Group パスの誤認 | 実URLパスでのマッチングに修正 |
| 13 | **コンポーネント** | ErrorDisplay, ToastContainer, ConfirmModal 未実装 | PRD要件に基づき追加 |
| 14 | **コンポーネント** | Header, BusinessSwitcher の実装が欠落 | PRD US-001, US-002 に基づき追加 |
| 15 | **DB** | シードデータの userPartnerId に不正値 | FK制約考慮で null に修正 |
| 16 | **DB** | シードがトランザクション未使用 | `$transaction` で原子化 |
| 17 | **DB** | TIMESTAMPTZ 未指定 | `@db.Timestamptz` 追加 |
| 18 | **インフラ** | アプリもDocker化（開発時の遅延原因） | DBのみDocker、アプリはローカル実行 |
| 19 | **命名** | ファイル名がcamelCase/kebab混在 | kebab-case に統一 |
| 20 | **テスト** | テストシナリオが曖昧 | 具体的な入力/期待結果を表形式で記載 |
