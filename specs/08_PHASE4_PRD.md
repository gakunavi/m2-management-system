# Phase 4: ダッシュボード + 予実管理 — PRD

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [00_PROJECT_PRD.md](./00_PROJECT_PRD.md) | 全体ゴール、ユーザー種別、技術スタック |
> | [01_DATA_MODEL.md](./01_DATA_MODEL.md) | テーブル定義、命名規則 |
> | [02_COMPONENT_DESIGN.md](./02_COMPONENT_DESIGN.md) | 設定オブジェクト型定義、フック設計 |
> | [04_EXISTING_SPECS.md](./04_EXISTING_SPECS.md) | 現行システム引き継ぎ仕様 |

---

## 1. 概要

### 1.1 目的

全社・事業別の売上予実管理と、営業活動の可視化ダッシュボードを実装する。経営層・事業担当者・代理店がそれぞれの視点で必要な数値を把握できるようにする。

### 1.2 Phase 4 のスコープ

| 機能 | 説明 |
|------|------|
| **売上目標設定** | 事業別・月別の売上目標をUI上で設定 |
| **売上実績の自動集計** | 事業ごとに設定した計上ルール（ステータス×金額フィールド）で自動集計 |
| **全社ダッシュボード** | 全事業横断の売上合計・予実達成率・パイプライン概要・月次推移 |
| **事業別ダッシュボード** | 事業の売上予実・案件パイプライン・代理店別成績・直近アクティビティ |
| **代理店ビュー** | 自社関連事業のサマリー・案件リスト・パイプライン進捗 |
| **売上計上ルール設定** | 事業マスタの businessConfig に計上ルールを追加 |

### 1.3 Phase 4 のスコープ外

| 機能 | 実装Phase |
|------|-----------|
| 代理店別・月別の売上目標 | 将来拡張（Phase 4では事業×月のみ） |
| 担当者別・月別の売上目標 | 将来拡張 |
| 月次レポート（PDF/Excel出力） | Phase 5 |
| 通知・アラート | Phase 5 |

---

## 2. 売上計上ルール

### 2.1 概要

「売上」の定義は事業によって異なるため、事業マスタの `businessConfig` に計上ルールを設定する方式とする。

### 2.2 計上ルールの設定項目

`businessConfig.revenueRecognition` として以下を設定:

| 設定項目 | 説明 | 例 |
|----------|------|----|
| `statusCode` | 売上として計上するステータスコード | `"purchased"`（受注済み） |
| `amountField` | 金額として参照する `projectCustomData` のフィールドキー | `"proposed_amount"` |
| `dateField` | 計上月の基準となるフィールド | `"projectExpectedCloseMonth"`（受注予定月）or カスタムフィールドキー |

### 2.3 計上ロジック

```
売上実績(事業B, 月M) = SUM(
  project.projectCustomData[amountField]
  WHERE project.businessId = B
    AND project.projectSalesStatus = statusCode
    AND 計上月基準(dateField) = M
    AND project.isActive = true
)
```

**計上月の決定:**
- `dateField` が `"projectExpectedCloseMonth"` の場合: `project.projectExpectedCloseMonth` を直接参照
- `dateField` がカスタムフィールドキーの場合: `project.projectCustomData[dateField]` を参照
- 日付型のフィールドは `YYYY-MM` に変換して月を決定

### 2.4 事業マスタUI拡張

事業詳細の設定タブに「売上計上ルール」セクションを追加:

```
売上計上ルール
├── 計上ステータス: [ドロップダウン: 事業のステータス定義から選択]
├── 金額フィールド: [ドロップダウン: projectFieldsのnumber型から選択]
└── 計上月基準:     [ドロップダウン: 受注予定月 / projectFieldsのdate/month型から選択]
```

---

## 3. 売上目標設定

### 3.1 データモデル

新規テーブル `SalesTarget` を追加:

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | INT PK | |
| `businessId` | INT FK | 事業 |
| `targetMonth` | VARCHAR(7) | `YYYY-MM` 形式 |
| `targetAmount` | DECIMAL(15,2) | 目標金額 |
| `createdAt` | DATETIME | |
| `updatedAt` | DATETIME | |
| `createdBy` | INT FK | |
| `updatedBy` | INT FK | |

- ユニーク制約: `(businessId, targetMonth)`
- 目標未設定の月は実績のみ表示（達成率は「-」表示）

### 3.2 目標設定UI

事業詳細ページに「売上目標」タブを追加。年度単位で12ヶ月分を一覧表示・編集。

```
売上目標設定 — 2025年度
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  月    │ 目標金額    │ 実績金額    │ 達成率
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 2025/04│ ¥10,000,000 │ ¥8,500,000  │ 85%
 2025/05│ ¥12,000,000 │ ¥13,200,000 │ 110%
 2025/06│ ¥15,000,000 │ ¥0          │ 0%
 ...    │ [入力欄]    │ (自動集計)  │ (自動)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 年間計 │ ¥144,000,000│ ¥21,700,000 │ 15%
```

- 年度は4月始まり（デフォルト）。変更可能にするかは将来検討
- 一括入力: 月額固定 or 個別入力
- admin/staff のみ編集可能

### 3.3 API

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/v1/businesses/:id/sales-targets?year=2025` | 年度の目標一覧取得（実績も合わせて返す） |
| PUT | `/api/v1/businesses/:id/sales-targets` | 年度の目標を一括保存（upsert） |

---

## 4. ダッシュボード

### 4.1 全社ダッシュボード（`/dashboard`、事業セレクター = 全体）

管理者・担当者向け。全事業を横断した経営数値の把握。

#### レイアウト

```
┌─────────────────────────────────────────────────────┐
│ KPI サマリーカード（4枚）                              │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ 売上実績  │ │ 目標達成率│ │ 案件総数  │ │受注案件数 │ │
│ │ ¥21.7M   │ │ 85%      │ │ 156件    │ │ 42件     │ │
│ │ ▲12% MoM │ │ ▼3pt MoM │ │ ▲8% MoM │ │ ▲5件 MoM│ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────────────────┤
│ 売上推移グラフ（折れ線 + 棒）          期間: [年度▼] │
│                                                     │
│  ¥ │    ╱──╲                                       │
│    │ ──╱    ╲──╱──  目標                           │
│    │ ▓▓  ▓▓  ▓▓  ▓▓  実績                         │
│    └──────────────────                              │
│      4月  5月  6月  7月...                           │
├────────────────────────┬────────────────────────────┤
│ パイプライン            │ 事業別サマリー             │
│ (ステータス別件数+金額) │ (事業ごとの売上・達成率)   │
│                        │                            │
│ ■ 商談中    45件 ¥32M │ MOAG事業   ¥15M / ¥20M 75%│
│ ■ 提案中    28件 ¥18M │ SA事業     ¥6.7M / ¥8M 84%│
│ ■ 契約待ち  12件 ¥8M  │                            │
│ ■ 受注済み  42件 ¥22M │                            │
│ ■ 失注       8件 ¥5M  │                            │
└────────────────────────┴────────────────────────────┘
```

#### KPI サマリーカード

| カード | 値 | 前月比 |
|--------|-----|--------|
| 売上実績 | 当月の全事業売上合計 | 前月との差額 or 増減率 |
| 目標達成率 | 当月の全事業達成率 | 前月とのポイント差 |
| 案件総数 | アクティブな案件の総数 | 前月との増減 |
| 受注案件数 | 当月に最終ステータスになった案件数 | 前月との増減 |

#### 売上推移グラフ

- 横軸: 月（年度単位）
- 棒グラフ: 月別実績
- 折れ線: 月別目標
- 累積表示の切替も検討

#### パイプライン

- ステータス別の案件件数と金額合計
- 横棒グラフ or ファネル表示
- 全事業横断 or 事業セレクターに連動

#### 事業別サマリー

- 事業ごとの売上実績 / 目標 / 達成率を一覧表示
- クリックで事業別ダッシュボードへ遷移

### 4.2 事業別ダッシュボード（`/dashboard`、事業セレクター = 特定事業）

事業セレクターで特定事業を選択した場合のダッシュボード。

#### レイアウト

```
┌─────────────────────────────────────────────────────┐
│ KPI サマリーカード（4枚）— 選択事業分のみ            │
├─────────────────────────────────────────────────────┤
│ 売上推移グラフ — 選択事業分                          │
├────────────────────────┬────────────────────────────┤
│ パイプライン            │ 代理店別成績ランキング     │
│ (ステータス別件数+金額) │                            │
│                        │ 1. ABC代理店  ¥8M  (5件)  │
│                        │ 2. DEF代理店  ¥5M  (3件)  │
│                        │ 3. 直販       ¥2M  (4件)  │
├────────────────────────┴────────────────────────────┤
│ 直近アクティビティ                                   │
│ • MG-0042: ステータス変更 → 受注済み  (2時間前)     │
│ • MG-0038: 新規作成 ABC商事  (5時間前)              │
└─────────────────────────────────────────────────────┘
```

#### 代理店別成績ランキング

- 代理店ごとの売上金額（計上ルールに基づく）でランキング
- 件数も合わせて表示
- `partner_id IS NULL` = 直販として集計
- 上位5〜10件を表示

#### 直近アクティビティ

- 案件の作成・ステータス変更を時系列で表示
- 直近10〜20件
- `projects.updatedAt` / `projectSalesStatus` の変更を検知

### 4.3 代理店ビュー（`/portal`、partner_admin / partner_staff）

代理店ユーザーがログインした場合のポータル画面。

#### レイアウト

```
┌─────────────────────────────────────────────────────┐
│ 事業別サマリーカード                                  │
│ ┌────────────────────┐ ┌────────────────────┐       │
│ │ MOAG事業            │ │ SA事業             │       │
│ │ 売上: ¥8M          │ │ 売上: ¥3M          │       │
│ │ 案件: 5件           │ │ 案件: 2件          │       │
│ └────────────────────┘ └────────────────────┘       │
├─────────────────────────────────────────────────────┤
│ パイプライン（自社案件のステータス別件数+金額）        │
├─────────────────────────────────────────────────────┤
│ 案件一覧（自社+下位代理店の案件）                     │
│ ┌──────┬──────┬──────┬──────┬──────┐                │
│ │番号  │顧客名│ステータス│予定月│金額  │                │
│ ├──────┼──────┼──────┼──────┼──────┤                │
│ │MG-01 │ABC商事│受注済み │2025-04│¥5M │                │
│ │MG-05 │DEF工業│商談中   │2025-06│¥3M │                │
│ └──────┴──────┴──────┴──────┴──────┘                │
└─────────────────────────────────────────────────────┘
```

#### 代理店ビューの表示ルール

| ロール | 表示範囲 |
|--------|----------|
| partner_admin | 自社 + 下位代理店の全案件 |
| partner_staff | 自分がアサインされた範囲の案件 |

- 事業別に集計（関与している事業のみ表示）
- 金額フィールドは事業の計上ルールに従う
- 案件リストは読み取り専用（既存の一覧テンプレートは使わない。シンプルなテーブル）

---

## 5. ダッシュボード API

### 5.1 統計API

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/v1/dashboard/summary` | KPIサマリー（売上、達成率、案件数） |
| GET | `/api/v1/dashboard/revenue-trend?year=2025` | 月別売上推移（目標+実績） |
| GET | `/api/v1/dashboard/pipeline` | パイプライン（ステータス別件数+金額） |
| GET | `/api/v1/dashboard/partner-ranking` | 代理店別成績ランキング |
| GET | `/api/v1/dashboard/activity` | 直近アクティビティ |

### 5.2 共通パラメータ

| パラメータ | 説明 |
|-----------|------|
| `businessId` | 事業ID（省略時 = 全社） |
| `year` | 年度（推移グラフ用） |
| `month` | 月（KPIサマリー用。デフォルト = 当月） |

### 5.3 スコープ制御

すべてのAPIでロールベースのスコープ制御を実施:

| ロール | スコープ |
|--------|----------|
| admin | 全事業全データ |
| staff | 自分がアサインされた事業のデータ |
| partner_admin | 自社+下位代理店の案件データ |
| partner_staff | 自分がアサインされた範囲の案件データ |

### 5.4 代理店ポータルAPI

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/v1/portal/summary` | 事業別サマリー（自社関連のみ） |
| GET | `/api/v1/portal/pipeline` | 自社パイプライン |
| GET | `/api/v1/portal/projects` | 自社案件一覧 |

---

## 6. チャートライブラリ

### 6.1 選定: Recharts

| 項目 | 内容 |
|------|------|
| ライブラリ | [Recharts](https://recharts.org/) |
| 理由 | React ネイティブ、宣言的API、Tailwind/shadcn と相性が良い、軽量 |
| 使用チャート | 棒グラフ（実績）、折れ線（目標）、横棒（パイプライン） |

### 6.2 使用するチャート種別

| チャート | 用途 |
|----------|------|
| `ComposedChart` (Bar + Line) | 売上推移（棒: 実績、線: 目標） |
| `BarChart` (horizontal) | パイプライン（ステータス別） |
| `BarChart` | 代理店別ランキング |

KPIカードはチャートライブラリを使わず、shadcn/ui の Card + Tailwind CSS で実装。

---

## 7. ページ構成

### 7.1 ファイル構成

```
src/app/(auth)/dashboard/
├── page.tsx                   # Server Component
└── _client.tsx                # クライアント（全社/事業別を切替表示）

src/app/(partner)/portal/
├── page.tsx                   # Server Component（既存拡張）
└── _client.tsx                # クライアント（代理店ビュー）

src/app/api/v1/dashboard/
├── summary/route.ts           # KPIサマリー
├── revenue-trend/route.ts     # 売上推移
├── pipeline/route.ts          # パイプライン
├── partner-ranking/route.ts   # 代理店ランキング
└── activity/route.ts          # 直近アクティビティ

src/app/api/v1/portal/
├── summary/route.ts           # 代理店サマリー
├── pipeline/route.ts          # 代理店パイプライン
└── projects/route.ts          # 代理店案件一覧

src/app/api/v1/businesses/[id]/
└── sales-targets/route.ts     # 売上目標CRUD

src/components/features/dashboard/
├── kpi-summary-cards.tsx      # KPIカード群
├── revenue-trend-chart.tsx    # 売上推移グラフ
├── pipeline-chart.tsx         # パイプラインチャート
├── partner-ranking.tsx        # 代理店ランキング
├── activity-feed.tsx          # 直近アクティビティ
└── business-summary-list.tsx  # 事業別サマリー

src/components/features/portal/
├── portal-summary-cards.tsx   # 代理店サマリーカード
├── portal-pipeline.tsx        # 代理店パイプライン
└── portal-project-list.tsx    # 代理店案件一覧

src/components/features/business/
└── sales-targets-tab.tsx      # 売上目標設定タブ（事業詳細に追加）
```

### 7.2 ダッシュボードの切替ロジック

```
/dashboard
├── selectedBusinessId === null → 全社ダッシュボード
└── selectedBusinessId === number → 事業別ダッシュボード
```

既存の `useBusiness()` フックで事業セレクターと連動。追加のルーティングは不要。

---

## 8. データモデル拡張

### 8.1 新規テーブル

```prisma
model SalesTarget {
  id            Int      @id @default(autoincrement())
  businessId    Int
  targetMonth   String   @db.VarChar(7)  // YYYY-MM
  targetAmount  Decimal  @db.Decimal(15, 2)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdBy     Int
  updatedBy     Int

  business      Business @relation(fields: [businessId], references: [id])
  creator       User     @relation("SalesTargetCreator", fields: [createdBy], references: [id])
  updater       User     @relation("SalesTargetUpdater", fields: [updatedBy], references: [id])

  @@unique([businessId, targetMonth])
  @@map("sales_targets")
}
```

### 8.2 businessConfig 拡張

`Business.businessConfig` に `revenueRecognition` を追加:

```typescript
interface BusinessConfig {
  // 既存
  projectFields: ProjectFieldDefinition[];

  // Phase 4 追加
  revenueRecognition?: {
    statusCode: string;     // 計上対象ステータスコード
    amountField: string;    // 金額フィールドキー（projectCustomData内）
    dateField: string;      // 計上月基準（"projectExpectedCloseMonth" or カスタムフィールドキー）
  };
}
```

---

## 9. 権限

| 操作 | admin | staff | partner_admin | partner_staff |
|------|-------|-------|---------------|---------------|
| 全社ダッシュボード閲覧 | ○ | ○（所属事業分） | × | × |
| 事業別ダッシュボード閲覧 | ○ | ○（所属事業） | × | × |
| 代理店ビュー閲覧 | × | × | ○ | ○ |
| 売上目標設定 | ○ | × | × | × |
| 売上計上ルール設定 | ○ | × | × | × |

---

## 10. 実装順序

```
Step 1: データモデル
  ├── SalesTarget モデル追加 + マイグレーション
  └── businessConfig の revenueRecognition 型定義追加

Step 2: 売上計上ルール
  ├── 事業詳細の設定タブに計上ルールUIを追加
  └── businessConfig 更新API対応

Step 3: 売上目標
  ├── 売上目標 API（GET / PUT）
  └── 事業詳細に売上目標タブを追加

Step 4: 統計API
  ├── 売上実績集計ロジック（計上ルールに基づく）
  ├── KPIサマリーAPI
  ├── 売上推移API
  ├── パイプラインAPI
  ├── 代理店ランキングAPI
  └── アクティビティAPI

Step 5: 全社ダッシュボード
  ├── Recharts導入
  ├── KPIサマリーカード
  ├── 売上推移グラフ
  ├── パイプラインチャート
  └── 事業別サマリー

Step 6: 事業別ダッシュボード
  ├── 事業別KPIカード
  ├── 代理店ランキング
  └── 直近アクティビティ

Step 7: 代理店ポータル
  ├── 代理店API（サマリー・パイプライン・案件一覧）
  ├── ポータル画面の実装
  └── ロールベースアクセス制御

Step 8: 動作検証
  └── 全機能の結合テスト
```

---

## 11. 詳細設計ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [DASHBOARD_DESIGN.md](./phase4/DASHBOARD_DESIGN.md) | ダッシュボード詳細設計（コンポーネント・データフロー・レイアウト） |
| [SALES_TARGET_DESIGN.md](./phase4/SALES_TARGET_DESIGN.md) | 売上目標・計上ルール詳細設計（スキーマ・API・UI） |
| [PORTAL_DESIGN.md](./phase4/PORTAL_DESIGN.md) | 代理店ポータル詳細設計 |
| [API_ENDPOINTS.md](./phase4/API_ENDPOINTS.md) | 全API仕様 |
