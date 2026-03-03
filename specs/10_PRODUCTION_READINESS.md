# M² 管理システム — 本番運用準備プラン

## 現状サマリー

Phase 0〜6 の機能実装は完了済み。
本番公開に向けて、以下の **13領域** の対応が必要。
セクション番号は実装優先順に並んでいる（§1 から順に対応）。

| # | 領域 | 重要度 | 現状 |
|---|---|---|---|
| 1 | セキュリティ強化 | 必須 | ✅ セキュリティヘッダー + レート制限（インメモリ Map middleware）実装済み |
| 2 | 環境設定・デプロイ | 必須 | ✅ 環境変数バリデーション + .env.example 更新済み / Dockerfile は任意 |
| 3 | データスコープ（権限フィルタリング） | 必須 | ✅ 事業API スコープ対応済み / 顧客・代理店は全件閲覧可（D-1決定） |
| 4 | S3 ストレージ | 必須 | スケルトン実装のみ（AWS設定後に対応） |
| 5 | メール通知 | 必須 | ✅ Resend 基盤実装済み（DB保存+メール送信） |
| 6 | 案件コメント / メモ | 推奨 | 未実装 |
| 7 | お知らせ（全体通知） | 推奨 | 未実装（既存 Notification は個別ユーザー宛のみ） |
| 8 | リマインダー / フォローアップ通知 | 推奨 | 未実装 |
| 9 | UI/UX 改善 | 推奨 | ✅ 削除モーダル二重送信防止済み / その他は未対応 |
| 10 | 運用整備 | 推奨 | ログ・バックアップ・本番シード未整備 |
| 11 | パフォーマンス最適化 | 推奨 | dynamic import なし・React.memo 未使用 |
| 12 | アクセシビリティ（a11y） | 必須 | aria-label 欠如・フォーカス管理不足 |
| 13 | レスポンシブ対応 | 必須 | モバイル非対応（サイドバー常時表示・グリッド固定） |

---

## 1. セキュリティ強化

### 1.1 現状

- NextAuth によるJWT認証あり
- middleware でロール別ページ制御あり
- Zod によるリクエストバリデーションあり
- レート制限・セキュリティヘッダー・CSRFトークンなし

### 1.2 対応タスク

#### 1.2.1 セキュリティヘッダー

**対象ファイル:** `next.config.js`

```javascript
headers: [
  {
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    ],
  },
]
```

#### 1.2.2 レート制限

**方針:** Next.js middleware レベルでシンプルなインメモリ制限を実装。

**対象:**
- `/api/auth/*`（ログイン） — 5回/分/IP
- `/api/v1/upload` — 10回/分/ユーザー
- その他 API — 100回/分/ユーザー

**実装方法:**
- **A) middleware 内でインメモリ Map**（シンプル、単一インスタンス向き）
- **B) upstash/ratelimit**（Vercel 向き、Redis ベース）
- **C) リバースプロキシ（nginx等）に任せる**（インフラ側で対応）

→ デプロイ先に応じて選択。

#### 1.2.3 CSRF 対策

Next.js App Router + NextAuth の組み合わせでは:
- API Routes は `SameSite=Lax` Cookie で保護（デフォルト動作）
- NextAuth の CSRF token が Session Provider 経由で利用可能
- **追加対応不要の可能性が高い**（SameSite 属性で十分）

→ カスタムフォームから外部 POST される懸念がなければ現状で可。

### 1.3 見積り

| タスク | 規模 |
|---|---|
| セキュリティヘッダー追加 | 極小 |
| レート制限（方針による） | 小〜中 |
| CSRF 確認（追加対応なしの可能性） | 極小 |

---

## 2. 環境設定・デプロイ

### 2.1 現状

- `.env` に開発用の値がハードコード
- `next.config.js` はほぼ空
- Docker は PostgreSQL のみ（アプリコンテナなし）

### 2.2 対応タスク

#### 2.2.1 環境変数の整理

**対象ファイル:** `.env.example` を更新

```
# Database
DATABASE_URL=

# NextAuth.js
NEXTAUTH_URL=
NEXTAUTH_SECRET=     # openssl rand -base64 32

# Storage
STORAGE_PROVIDER=    # local | s3
AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Email
EMAIL_PROVIDER=      # resend | sendgrid | ses
EMAIL_FROM=
EMAIL_API_KEY=
```

#### 2.2.2 環境変数バリデーション

**新規ファイル:** `src/lib/env.ts`

```typescript
// アプリ起動時に必須の環境変数が設定されているかチェック
// 未設定の場合は明確なエラーメッセージで起動失敗
```

#### 2.2.3 next.config.js の本番設定

**対象ファイル:** `next.config.js`

```javascript
// セキュリティヘッダー（§1と連携）
// 画像最適化設定
// output: 'standalone' （コンテナデプロイ用）
```

#### 2.2.4 本番用 Dockerfile（任意）

```dockerfile
# マルチステージビルド
# Node.js 20 Alpine ベース
# standalone output 使用
```

### 2.3 見積り

| タスク | 規模 |
|---|---|
| .env.example 更新 | 極小 |
| 環境変数バリデーション | 小 |
| next.config.js 本番設定 | 小 |
| Dockerfile（任意） | 中 |

---

## 3. データスコープ（権限フィルタリング）

### 3.1 現状

**対応済み（スコープ制御あり）:**
- `GET /api/v1/projects` — admin=全件 / staff=アサイン事業 / partner_admin=自社+下位代理店 / partner_staff=自分担当分
- `GET /api/v1/projects/[id]` — partner系はスコープチェック済み
- `GET /api/v1/qa/items` — partner系はpublished+publicのみ
- `GET /api/v1/notifications` — 自分宛のみ
- `GET /api/v1/dashboard/*` — `getBusinessIdsForUser()` で事業スコープ適用
- `GET /api/v1/portal/*` — `getPartnerScope()` で代理店スコープ適用

**未対応（全件返却）:**
- `GET /api/v1/customers` — 全顧客を返却
- `GET /api/v1/customers/[id]` — アクセス制限なし
- `GET /api/v1/partners` — 全代理店を返却
- `GET /api/v1/partners/[id]` — アクセス制限なし
- `GET /api/v1/businesses` — 全事業を返却
- `GET /api/v1/businesses/[id]` — アクセス制限なし

### 3.2 設計方針

middleware でページ遷移はブロック済み（partner系は `/portal` にリダイレクト）。
そのため API レベルのスコープは **社内ユーザー（admin/staff）間** の制御が主目的。

| ロール | 顧客・代理店 | 事業 | 案件 |
|---|---|---|---|
| admin | 全件 | 全件 | 全件 |
| staff | アサイン事業に紐づく顧客・代理店 | アサイン事業のみ | アサイン事業のみ（実装済み） |
| partner_admin | アクセス不可（middleware） | アクセス不可 | 自社+下位代理店（実装済み） |
| partner_staff | アクセス不可（middleware） | アクセス不可 | 自分担当分（実装済み） |

### 3.3 対応タスク

#### 3.3.1 事業一覧/詳細のスコープ（staff向け）

**対象ファイル:**
- `src/app/api/v1/businesses/route.ts` — GET handler
- `src/app/api/v1/businesses/[id]/route.ts` — GET handler

**実装内容:**
```
staff の場合:
  - UserBusinessAssignment から businessIds を取得
  - 一覧: where に { id: { in: businessIds } } を追加
  - 詳細: id が businessIds に含まれるか確認 → 含まれなければ 403
```

#### 3.3.2 顧客一覧/詳細のスコープ（staff向け）

**対象ファイル:**
- `src/app/api/v1/customers/route.ts` — GET handler
- `src/app/api/v1/customers/[id]/route.ts` — GET handler

**実装内容:**
```
staff の場合:
  - UserBusinessAssignment から businessIds を取得
  - 一覧: 案件テーブル経由で「自分のアサイン事業に紐づく顧客」のみ返す
    → Project で businessId IN (businessIds) かつ customerId が存在する顧客
    → OR 直接 businessId を持つ場合はそれでフィルタ
  - 詳細: 同様のチェック → 該当しなければ 403
```

**注意:** 顧客は案件経由で事業に紐づく（顧客テーブル自体に businessId がない可能性）。
→ 案件テーブルを JOIN して判定するか、「staff は全顧客閲覧可」とするか要判断。

#### 3.3.3 代理店一覧/詳細のスコープ（staff向け）

**対象ファイル:**
- `src/app/api/v1/partners/route.ts` — GET handler
- `src/app/api/v1/partners/[id]/route.ts` — GET handler

**実装内容:**
```
顧客と同じ方針で判断。
```

#### 3.3.4 既存ヘルパーの活用

`src/lib/revenue-helpers.ts` に既に存在:
- `getBusinessIdsForUser(prisma, user)` — admin=null(全件), staff=アサイン事業IDs
- `getPartnerScope(prisma, partnerId)` — 自社+下位代理店IDs

→ 新規ヘルパーは不要。既存関数を各APIで呼び出すだけ。

### 3.4 見積り

| タスク | 規模 |
|---|---|
| 事業 API スコープ | 小（whereに条件追加のみ） |
| 顧客 API スコープ | 中（案件経由の紐づけ判定が必要） |
| 代理店 API スコープ | 中（同上） |

---

## 4. S3 ストレージ

### 4.1 現状

- `src/lib/storage/s3-storage-adapter.ts` にスケルトン実装あり
- `@aws-sdk/client-s3` 未インストール
- `STORAGE_PROVIDER=local` で開発中（`public/uploads/` に保存）

### 4.2 対応タスク

#### 4.2.1 AWS SDK インストール

```bash
npm install @aws-sdk/client-s3
```

#### 4.2.2 S3 アダプタ実装

**対象ファイル:** `src/lib/storage/s3-storage-adapter.ts`

**実装内容:**
- コメントアウトを解除して S3Client / PutObjectCommand / DeleteObjectCommand / HeadObjectCommand を有効化
- throw 文を削除
- ContentDisposition 設定（ダウンロード時のファイル名制御）

#### 4.2.3 環境変数設定

```
AWS_REGION=ap-northeast-1
AWS_S3_BUCKET=m2-management-files
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
STORAGE_PROVIDER=s3
```

#### 4.2.4 S3 バケット設定（AWS側）

- バケット作成（プライベートアクセス）
- CORS 設定（アップロード用）
- ライフサイクルルール（必要に応じて）
- IAM ユーザー作成（PutObject / DeleteObject / HeadObject 権限）

### 4.3 見積り

| タスク | 規模 |
|---|---|
| SDK インストール + アダプタ実装 | 小（コメント解除+微調整） |
| AWS バケット・IAM 設定 | 小（手動作業） |
| テスト（アップロード/ダウンロード/削除） | 小 |

---

## 5. メール通知

### 5.1 現状

- `src/lib/notification-helper.ts` で DB にレコード作成のみ
- メール送信の仕組みなし
- 通知トリガー: 案件ステータス変更時のみ

### 5.2 対応タスク

#### 5.2.1 メール送信ライブラリ導入

**選択肢:**
- **A) Resend**（推奨） — Next.js と相性良好、SDK がシンプル
- **B) SendGrid** — 実績豊富
- **C) AWS SES** — S3 と同じ AWS 基盤で統一可能
- **D) Nodemailer + SMTP** — 汎用的、メールサーバー必要

#### 5.2.2 メール送信ヘルパー作成

**新規ファイル:** `src/lib/email.ts`

```typescript
// sendEmail(to, subject, html) を実装
// 環境変数: EMAIL_PROVIDER, EMAIL_FROM, EMAIL_API_KEY 等
```

#### 5.2.3 通知ヘルパー拡張

**対象ファイル:** `src/lib/notification-helper.ts`

**実装内容:**
- DB 保存後にメール送信を非同期実行
- ユーザーの email を取得して送信
- 送信失敗時はログ出力のみ（DB通知は保持）

#### 5.2.4 メールテンプレート

- 案件ステータス変更通知
- （将来的に）問い合わせ通知、月次レポート等

#### 5.2.5 環境変数

```
EMAIL_PROVIDER=resend    # resend | sendgrid | ses
EMAIL_FROM=noreply@example.com
EMAIL_API_KEY=xxxxx
```

### 5.3 見積り

| タスク | 規模 |
|---|---|
| メール送信ライブラリ導入 | 小 |
| メール送信ヘルパー作成 | 小 |
| 通知ヘルパー拡張（DB保存+メール送信） | 小 |
| メールテンプレート（1種類） | 小 |

---

## 6. 案件コメント / メモ

### 6.1 概要

案件に対するタイムライン形式のコメント機能。営業担当者間の引き継ぎ・進捗共有・社内メモに使用。
既存の `projectNotes`（単一テキスト）とは別に、時系列の複数コメントを管理する。

### 6.2 データモデル

**新規テーブル:** `ProjectComment`

```prisma
model ProjectComment {
  id        Int      @id @default(autoincrement())
  projectId Int      @map("project_id")
  userId    Int      @map("user_id")
  content   String   @map("content") @db.Text
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id])

  @@index([projectId, createdAt(sort: Desc)])
  @@map("project_comments")
}
```

### 6.3 対応タスク

#### 6.3.1 API エンドポイント

**新規ファイル:**
- `src/app/api/v1/projects/[id]/comments/route.ts`

```
GET  /api/v1/projects/:id/comments    — コメント一覧（新しい順）
POST /api/v1/projects/:id/comments    — コメント追加
```

**権限:**
- admin/staff: 全案件にコメント可能
- partner_admin/partner_staff: 自スコープ内の案件にコメント可能（ポータル経由）
- 削除: 自分のコメントのみ（admin は全件削除可）

#### 6.3.2 UI コンポーネント

**新規ファイル:**
- `src/components/features/project/project-comments-tab.tsx`

**実装内容:**
```
- 案件詳細のカスタムタブ「コメント」として追加
- タイムライン形式（アバター + ユーザー名 + 日時 + コメント本文）
- テキストエリア + 送信ボタン（Shift+Enter でも送信）
- 自分のコメントに削除ボタン
- 無限スクロールまたは「もっと読み込む」ボタン
- 全ロール共通タブ（COMMON_CUSTOM_TABS に追加）
```

#### 6.3.3 ポータル対応

- ポータル用API: `GET/POST /api/v1/portal/projects/:id/comments`
- ポータルUI: 同じ `ProjectCommentsTab` を再利用（削除は自分のコメントのみ）

### 6.4 見積り

| タスク | 規模 |
|---|---|
| Prisma スキーマ + マイグレーション | 極小 |
| API エンドポイント（GET/POST/DELETE） | 小 |
| コメントタブ UI | 中 |
| ポータル対応 | 小 |

---

## 7. お知らせ（全体通知）

### 7.1 概要

既存の `Notification` は個別ユーザー宛（案件ステータス変更通知など）。
全社向け・事業向けのお知らせ（システムメンテナンス告知、業務連絡など）を管理する機能を追加。

### 7.2 データモデル

**新規テーブル:** `Announcement`

```prisma
model Announcement {
  id          Int       @id @default(autoincrement())
  businessId  Int?      @map("business_id")    // null=全社共通、N=事業別
  title       String    @map("title") @db.VarChar(200)
  content     String    @map("content") @db.Text
  priority    String    @default("normal") @map("priority") @db.VarChar(20)  // normal | important | urgent
  publishedAt DateTime? @map("published_at") @db.Timestamptz(6)             // null=下書き
  expiresAt   DateTime? @map("expires_at") @db.Timestamptz(6)               // null=無期限
  createdBy   Int       @map("created_by")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  business Business? @relation(fields: [businessId], references: [id])
  author   User      @relation("AnnouncementAuthor", fields: [createdBy], references: [id])

  @@index([publishedAt(sort: Desc)])
  @@map("announcements")
}
```

### 7.3 対応タスク

#### 7.3.1 API エンドポイント

**新規ファイル:**
- `src/app/api/v1/announcements/route.ts`
- `src/app/api/v1/announcements/[id]/route.ts`

```
GET    /api/v1/announcements        — お知らせ一覧（公開中のみ / admin は全件）
POST   /api/v1/announcements        — 新規作成（admin のみ）
GET    /api/v1/announcements/:id    — 詳細
PATCH  /api/v1/announcements/:id    — 編集（admin のみ）
DELETE /api/v1/announcements/:id    — 削除（admin のみ）
```

**スコープ:**
- admin: 全お知らせを閲覧・管理
- staff: 全社共通 + 自分のアサイン事業のお知らせを閲覧
- partner 系: 全社共通 + 自分の関連事業のお知らせを閲覧（ポータル経由）

#### 7.3.2 ダッシュボード表示

**対象ファイル:**
- `src/components/features/dashboard/dashboard-client.tsx`（社内）
- `src/app/(partner)/portal/_components/portal-dashboard-client.tsx`（ポータル）

**実装内容:**
```
- ダッシュボード上部にお知らせバナー/カード表示
- priority=urgent → 赤背景バナー、important → 黄色、normal → 通常カード
- 「すべてのお知らせを見る」リンク → お知らせ一覧ページ
- expiresAt 経過済みのお知らせは自動非表示
```

#### 7.3.3 管理画面（admin）

**新規ファイル:**
- `src/app/(auth)/announcements/page.tsx` — 一覧
- `src/app/(auth)/announcements/new/page.tsx` — 新規作成
- `src/app/(auth)/announcements/[id]/page.tsx` — 詳細・編集

**実装内容:**
```
- Config 駆動テンプレートは不使用（軽量な専用 UI）
- 一覧: タイトル / 対象（全社/事業名） / 優先度 / ステータス（下書き/公開中/期限切れ）
- 作成: タイトル / 本文 / 対象事業（全社 or 事業選択） / 優先度 / 公開日 / 有効期限
- ナビゲーション: adminOnly で「お知らせ管理」をサイドバーに追加
```

### 7.4 見積り

| タスク | 規模 |
|---|---|
| Prisma スキーマ + マイグレーション | 極小 |
| API エンドポイント（CRUD） | 小 |
| ダッシュボードバナー表示 | 小 |
| 管理画面（一覧・作成・編集） | 中 |
| ポータル表示対応 | 小 |

---

## 8. リマインダー / フォローアップ通知

### 8.1 概要

案件に「次回フォロー日」を設定し、当日にアプリ内通知（+ メール通知（§5 実装後））を自動送信。
営業活動の抜け漏れ防止に直結する機能。

### 8.2 データモデル

**既存テーブル拡張:** `Project` にフィールド追加

```prisma
// Project モデルに追加
followUpDate    DateTime? @map("follow_up_date") @db.Date          // 次回フォロー日
followUpNote    String?   @map("follow_up_note") @db.VarChar(500)  // フォロー内容メモ
```

**通知生成:** 既存の `Notification` テーブルを活用（新規テーブル不要）

```
notificationType: 'follow_up_reminder'
relatedEntity: 'project'
relatedEntityId: project.id
```

### 8.3 対応タスク

#### 8.3.1 スキーマ変更 + API 拡張

**対象ファイル:**
- `prisma/schema.prisma` — Project モデルにフィールド追加
- `src/app/api/v1/projects/[id]/route.ts` — PATCH で `followUpDate` / `followUpNote` の更新対応

**実装内容:**
```
- フォーム/インライン編集で followUpDate / followUpNote を設定可能にする
- 案件詳細の情報セクションに「次回フォロー日」フィールドを追加
- 案件一覧テーブルに「次回フォロー日」列を追加（ソート対応）
```

#### 8.3.2 リマインダー通知バッチ

**新規ファイル:** `src/app/api/v1/cron/follow-up-reminders/route.ts`

**実装内容:**
```
GET /api/v1/cron/follow-up-reminders?secret=CRON_SECRET

処理:
1. followUpDate = 今日 かつ projectIsActive = true の案件を取得
2. 各案件の projectAssignedUserId 宛に Notification レコードを作成
3. §5（メール通知）実装済みの場合はメールも送信
4. 処理完了後にレスポンス返却（処理件数）

トリガー:
- 外部 cron サービス（Vercel Cron / AWS EventBridge / crontab）から毎朝 8:00 に呼び出し
- CRON_SECRET 環境変数でエンドポイントを保護
```

#### 8.3.3 UI 拡張

**対象ファイル:**
- `src/config/entities/project.tsx` — 詳細・一覧・フォーム Config にフィールド追加
- `src/app/api/v1/projects/route.ts` — 一覧 API の select/orderBy に追加
- `src/app/api/v1/projects/csv/route.ts` — CSV エクスポートに列追加

**実装内容:**
```
案件フォーム:
  - followUpDate: date picker
  - followUpNote: テキスト入力（500文字以内）

案件一覧:
  - 「次回フォロー日」列追加（defaultVisible: false、ソート対応）
  - フォロー日が今日以前 → 赤文字で強調表示

案件詳細:
  - 情報セクションに「次回フォロー日」「フォロー内容」表示
  - インライン編集可能

ダッシュボード（任意）:
  - 「本日のフォロー予定」ウィジェット（件数 + リンク）
```

### 8.4 見積り

| タスク | 規模 |
|---|---|
| Prisma スキーマ + マイグレーション | 極小 |
| API 拡張（PATCH / 一覧 / CSV） | 小 |
| リマインダー cron エンドポイント | 小 |
| UI（フォーム・一覧・詳細への追加） | 小 |
| ダッシュボードウィジェット（任意） | 小 |

---

## 9. UI/UX 改善

### 6.1 現状

- ルート別 `error.tsx` がルートレベル（`src/app/error.tsx`）にのみ存在
- ダークモード: CSS変数定義済み（`.dark` ブロック）+ `darkMode: ["class"]` 設定済みだがトグルUIなし
- トーストに hardcoded カラー（`bg-green-50` 等）でダークモード非対応
- 削除確認モーダルの `isLoading` が未接続（二重送信の可能性）
- on-blur バリデーションなし（submit 時のみ）
- チャートのローディング表示がプレーンテキスト（スケルトンではない）
- トーストの同時表示数に上限なし

### 6.2 対応タスク

#### 6.2.1 ルート別エラー境界の追加

**対象ディレクトリ:**
- `src/app/(auth)/dashboard/error.tsx`
- `src/app/(auth)/customers/error.tsx`
- `src/app/(auth)/projects/error.tsx`

**実装内容:**
```
各ルートに error.tsx を配置 → チャートやAPI障害を局所的にキャッチ
ダッシュボードのチャートが壊れても他のウィジェットは表示継続
```

#### 6.2.2 ダークモード基盤整備

**対象ファイル:**
- `src/providers/index.tsx` — `ThemeProvider` 追加（`next-themes` 導入）
- `src/components/layout/header.tsx` — ダークモードトグルボタン追加
- `src/components/ui/toast-container.tsx` — hardcoded カラーを CSS 変数ベースに変更
- `src/components/features/dashboard/kpi-summary-cards.tsx` — `text-green-600` → `text-green-600 dark:text-green-400` 等

**実装内容:**
```bash
npm install next-themes
```
```tsx
// providers/index.tsx
<ThemeProvider attribute="class" defaultTheme="light">
  {children}
</ThemeProvider>
```

#### 6.2.3 削除モーダルの二重送信防止

**対象ファイル:** `src/components/templates/entity-detail-template.tsx`

**実装内容:**
```
ConfirmModal の onConfirm に isLoading state を接続
実行中はボタンを disabled + スピナー表示
```

#### 6.2.4 トースト上限設定

**対象ファイル:** `src/hooks/use-toast.ts`

**実装内容:**
```
同時表示上限を 5 件に制限（古いものから自動削除）
```

#### 6.2.5 チャートローディングのスケルトン化

**対象ファイル:**
- `src/components/features/dashboard/revenue-trend-chart.tsx`
- `src/components/features/dashboard/pipeline-chart.tsx`

**実装内容:**
```
「読み込み中...」テキスト → Skeleton コンポーネントに置換
```

### 6.3 見積り

| タスク | 規模 |
|---|---|
| ルート別 error.tsx | 小（3〜5ファイル） |
| ダークモード基盤（next-themes + トグル） | 中 |
| hardcoded カラー修正 | 小（対象箇所は限定的） |
| 削除モーダル二重送信防止 | 極小 |
| トースト上限 | 極小 |
| チャートスケルトン | 極小 |

---

## 10. 運用整備

### 10.1 対応タスク

#### 10.1.1 本番用シードスクリプト

**新規ファイル:** `prisma/seed-production.ts`

- 初期 admin ユーザーのみ作成
- パスワードは環境変数から取得（`ADMIN_INITIAL_PASSWORD`）
- 既存データがある場合はスキップ

#### 10.1.2 構造化ログ（任意）

**現状:** `console.error()` のみ
**推奨:** JSON 形式のログ出力（CloudWatch / Datadog 等との連携用）

#### 10.1.3 エラー追跡（任意）

**推奨:** Sentry 導入
```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

#### 10.1.4 DB バックアップ（インフラ側）

- AWS RDS / Cloud SQL 等のマネージドDB → 自動バックアップ有効化
- 手動バックアップ: `pg_dump` のcron設定

### 10.2 見積り

| タスク | 規模 |
|---|---|
| 本番用シードスクリプト | 小 |
| 構造化ログ | 小 |
| Sentry 導入 | 小 |
| DB バックアップ設定 | インフラ作業 |

---

## 11. パフォーマンス最適化

### 11.1 現状

- `next/dynamic`（動的インポート）の使用がゼロ
- recharts（チャートライブラリ）が全認証ページのバンドルに含まれる
- `React.memo` の使用がゼロ（SpreadsheetTable の EditableCell は行×列分レンダリング）

### 11.2 対応タスク

#### 11.2.1 チャートコンポーネントの遅延読み込み

**対象ファイル:**
- `src/components/features/dashboard/revenue-trend-chart.tsx`
- `src/components/features/dashboard/pipeline-chart.tsx`
- `src/components/features/dashboard/partner-ranking.tsx`

**実装内容:**
```typescript
// ダッシュボードクライアントでの import を next/dynamic に変更
const RevenueTrendChart = dynamic(
  () => import('@/components/features/dashboard/revenue-trend-chart'),
  { loading: () => <ChartSkeleton /> }
);
```

#### 11.2.2 重量コンポーネントの React.memo 適用

**対象ファイル:**
- `src/components/ui/editable-cell.tsx` — セル単位の再レンダリング抑制
- `src/components/ui/spreadsheet-table.tsx` — `DraggableHeader` のメモ化

**実装内容:**
```typescript
export const EditableCell = React.memo(function EditableCell(props) { ... });
```

#### 11.2.3 ルート別 loading.tsx の追加

**対象ディレクトリ:**
- `src/app/(auth)/customers/loading.tsx`
- `src/app/(auth)/partners/loading.tsx`
- `src/app/(auth)/projects/loading.tsx`
- `src/app/(auth)/dashboard/loading.tsx`
- `src/app/(partner)/portal/loading.tsx`

**実装内容:**
```
各ルートに loading.tsx を配置 → Next.js が自動で Suspense 境界を生成
テーブル系ページ: スケルトンテーブル表示
ダッシュボード: カード + チャートのスケルトン表示
```

### 11.3 見積り

| タスク | 規模 |
|---|---|
| チャート遅延読み込み（dynamic import） | 小 |
| React.memo 適用 | 小 |
| ルート別 loading.tsx | 小（5ファイル程度） |

---

## 12. アクセシビリティ（a11y）

### 12.1 現状

- アイコンのみボタンに `aria-label` なし（ページネーション・検索クリア・トースト閉じる等）
- トーストコンテナに `aria-live` なし（スクリーンリーダーが通知を読み上げない）
- サイドバーのアクティブリンクに `aria-current="page"` なし
- パンくずリストの `<nav>` に `aria-label` なし
- フォーム必須フィールドに `aria-required` なし
- バリデーションエラーとinputが `aria-describedby` で紐づいていない
- ソート可能な列ヘッダーにキーボード操作（`tabIndex` / `role="button"`）なし

### 12.2 対応タスク

#### 12.2.1 アイコンボタンの aria-label 追加

**対象ファイル:**
- `src/components/ui/pagination.tsx` — 4つのページ送りボタン
- `src/components/form/search-input.tsx` — クリアボタン
- `src/components/ui/toast-container.tsx` — 閉じるボタン

**実装内容:**
```tsx
// 例: ページネーション
<Button aria-label="最初のページへ" ...><ChevronsLeft /></Button>
<Button aria-label="前のページへ" ...><ChevronLeft /></Button>
```

#### 12.2.2 トースト aria-live 追加

**対象ファイル:** `src/components/ui/toast-container.tsx`

**実装内容:**
```tsx
<div role="status" aria-live="polite" className="fixed top-4 right-4 ...">
```

#### 12.2.3 ナビゲーションの aria 属性

**対象ファイル:**
- `src/components/layout/sidebar.tsx` — アクティブリンクに `aria-current="page"`
- `src/components/layout/page-header.tsx` — パンくず `<nav aria-label="パンくずリスト">`

#### 12.2.4 フォームフィールドの aria 強化

**対象ファイル:** `src/components/form/form-field.tsx`

**実装内容:**
```
- input に aria-required="true"（required 時）
- エラー表示に id 付与 → input に aria-describedby で紐づけ
```

#### 12.2.5 テーブルヘッダーのキーボード操作

**対象ファイル:** `src/components/ui/data-table.tsx`

**実装内容:**
```
ソート可能な <th> に role="button" tabIndex={0} onKeyDown（Enter/Space で発火）
```

### 12.3 見積り

| タスク | 規模 |
|---|---|
| aria-label 追加（全箇所） | 小（属性追加のみ） |
| トースト aria-live | 極小 |
| ナビゲーション aria | 極小 |
| フォーム aria 強化 | 小 |
| テーブルヘッダーキーボード | 小 |

---

## 13. レスポンシブ対応

### 13.1 現状

- サイドバー（`w-64` / `w-16`）が常時表示。モバイルでハンバーガーメニューやオフキャンバスなし
- フォームグリッドが `grid-cols-2` / `grid-cols-3` 固定（ブレークポイントなし）
- 詳細画面の情報グリッドも同様に固定
- SpreadsheetTable はモバイルでの代替表示なし
- フィルターパネルが `w-[480px]` 固定でモバイルでオーバーフロー
- トーストコンテナが `w-96` 固定でモバイルでオーバーフロー

### 13.2 対応タスク

#### 13.2.1 モバイルサイドバー

**対象ファイル:**
- `src/components/layout/sidebar.tsx`
- `src/app/(auth)/layout.tsx`
- `src/app/(partner)/layout.tsx`

**実装内容:**
```
- md 未満: サイドバーを非表示 + ハンバーガーボタンで Sheet/Drawer 表示
- md 以上: 現在の折りたたみサイドバーを維持
- 実装: Radix Dialog または shadcn/ui Sheet コンポーネント
```

#### 13.2.2 フォームグリッドのレスポンシブ化

**対象ファイル:**
- `src/components/templates/entity-form-template.tsx`
- `src/components/templates/entity-detail-template.tsx`

**実装内容:**
```
現在: grid-cols-3（固定）
変更: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
```

#### 13.2.3 フィルター・トーストの幅修正

**対象ファイル:**
- `src/components/ui/filter-bar.tsx` — `w-[480px]` → `w-full max-w-[480px]`
- `src/components/ui/toast-container.tsx` — `w-96` → `w-80 sm:w-96 max-w-[calc(100vw-2rem)]`

### 13.3 見積り

| タスク | 規模 |
|---|---|
| モバイルサイドバー | 中（Sheet コンポーネント導入 + レイアウト変更） |
| フォームグリッドレスポンシブ | 小（Tailwind クラス変更のみ） |
| フィルター・トースト幅修正 | 極小 |

---

## 実装優先順位

### Phase A: 必須対応（本番公開ブロッカー）

即対応可能なものから依存関係順に並べる。判断待ち（D-x）の項目は Phase B に移動。

```
--- 即対応可（依存なし・極小〜小規模） ---
A-1. セキュリティヘッダー追加（§1）                         ← 設定追加のみ
A-2. 環境変数バリデーション（§2）                           ← A-3〜A-5 の前提
A-3. .env.example 更新（§2）                                ← A-2 と同時対応
A-4. 削除モーダル二重送信防止（§9）                         ← バグ修正、isLoading 接続のみ

--- インフラ基盤（A-2 の後） ---
A-5. データスコープ — 事業 API（§3）                        ← 既存ヘルパー活用、判断不要
A-6. S3 ストレージ実装（§4）                                ← SDK + コメント解除 + AWS設定

--- 判断確定後 ---
A-7. データスコープ — 顧客/代理店 API（§3）                 ← D-1 の判断確定後に実装
A-8. メール通知基盤（§5）                                   ← D-2 の判断確定後に実装
```

### Phase B: 推奨対応（運用品質向上 + 新機能）

Phase A 完了後、影響度順に実装。

```
--- 新機能（業務効率直結） ---
B-1. 案件コメント / メモ（§6）                              ← スキーマ + API + タブ UI
B-2. お知らせ（全体通知）（§7）                              ← スキーマ + API + 管理画面 + バナー
B-3. リマインダー / フォローアップ通知（§8）                 ← スキーマ拡張 + cron + UI（§5 の後が理想）

--- バグ修正・安定性 ---
B-4. 本番用シードスクリプト（§10）                          ← 本番デプロイの前提
B-5. ルート別 loading.tsx / error.tsx 追加（§9, §11）       ← UX 安定性向上
B-6. トースト同時表示上限（§9）                             ← 極小修正

--- パフォーマンス ---
B-7. チャート遅延読み込み（§11）                            ← バンドルサイズ削減
B-8. React.memo 適用（§11）                                 ← 大量データ表示の性能改善

--- アクセシビリティ ---
B-9. アイコンボタン aria-label 追加（§12）                  ← 属性追加のみ
B-10. トースト aria-live 追加（§12）                        ← 1行追加
B-11. フォーム aria 強化（§12）
B-12. テーブルヘッダーのキーボードソート対応（§12）

--- レスポンシブ ---
B-13. フォームグリッドのレスポンシブ化（§13）               ← Tailwind クラス変更のみ
B-14. フィルター・トースト幅のモバイル対応（§13）           ← 極小修正
B-15. モバイルサイドバー（§13）                             ← D-5 の判断後に実装

--- インフラ ---
B-16. next.config.js 本番設定（§2）
B-17. レート制限（§1）                                      ← D-3 の判断後に実装
B-18. Sentry 導入（§10）
B-19. チャートローディングのスケルトン化（§9）
```

### Phase C: 任意（将来対応）

```
C-1. Dockerfile 作成（§2）
C-2. 構造化ログ（§10）
C-3. 通知テンプレート拡充（§5）
C-4. ファイル孤立削除バッチ
C-5. ダークモード基盤整備（§9）                             ← D-6 の判断後
C-6. ナビゲーション aria 属性（§12）
C-7. on-blur バリデーション（§9）
```

---

## 判断が必要な項目

| # | 項目 | 選択肢 | 判断基準 |
|---|---|---|---|
| D-1 | 顧客/代理店の staff スコープ | A) 案件経由で紐づく分のみ / B) 全件閲覧可 | 業務要件による |
| D-2 | メール送信サービス | Resend / SendGrid / SES / SMTP | 既存インフラ・コストによる |
| D-3 | レート制限の実装場所 | アプリ内 / リバースプロキシ | デプロイ先による |
| D-4 | デプロイ先 | Vercel / AWS ECS / VPS / その他 | コスト・運用体制による |
| D-5 | モバイル対応範囲 | A) 全画面レスポンシブ / B) 主要画面のみ / C) タブレット以上 | 利用シーンによる |
| D-6 | ダークモード | A) 実装する / B) CSS変数定義を削除して明示的に不要化 | ユーザー要望による |
