# 会計パイプライン機能 仕様書

## 1. 概要

### 1.1 目的
成約案件の売上・手数料分配・代理店支払いを一元管理し、月次支払い明細をPDF出力する機能。
現在スプレッドシートで運用している「会計パイプラインシート → 支払い明細転記」のワークフローをシステム化する。

### 1.2 スコープ
| 含む | 含まない |
|------|----------|
| 会計パイプライン（案件別売上管理） | 会計ソフト連携 |
| 手数料分配（N階層・直/間対応） | 請求書発行 |
| 着金エントリ（ショット/ストック対応） | 入金消込 |
| 月次締め処理 | 税務計算 |
| 支払い明細（代理店別・事業別） | |
| 支払い明細の確認・手修正・承認フロー | |
| PDF出力（承認後発行） | |

### 1.3 ビジネスモデル対応

| モデル | 説明 | 分配例 |
|--------|------|--------|
| 自社メーカー | 売上100%を受け取り、代理店に払出 | 売上240万 → 自社180万 + BP1 48万 + BP2 12万 |
| 自社代理店 | メーカーから手数料を受け取り、下位に再分配 | 手数料48万(20%) → 自社18万(7.5%) + BP1 24万(10%) + BP2 6万(2.5%) |

いずれのモデルも「売上金額に対する各分配先の料率」として統一管理する。
合計が100%（メーカーモデル）でも100%未満（代理店モデル）でも対応可能。

---

## 2. 手数料率体系

### 2.1 直案件・間接案件の定義

| 種別 | 定義 | 例 |
|------|------|-----|
| **直案件** | 案件に紐づいている代理店（Project.partnerId）自身の案件 | A代理店が紹介した案件 → Aにとって直案件 |
| **間接案件** | 自分の下位代理店が紹介した案件 | Bが紹介した案件 → Aにとって間接案件（AはBの上位） |

### 2.2 料率マスタ（PartnerBusinessLink）

事業ごとに代理店の直/間の2つの手数料率を管理する。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| directCommissionRate | Decimal(7,4)? | 直案件の手数料率 % |
| indirectCommissionRate | Decimal(7,4)? | 間接案件の手数料率 % |

※ 既存の `commissionRate: Decimal(5,2)` は `directCommissionRate` に移行（マイグレーションで対応）

### 2.3 分配自動計算ロジック

着金エントリ追加時に、以下のロジックで自動計算を行う。

```
入力: 案件の紹介代理店（Project.partnerId）、着金額

Step 1: 紹介代理店の直料率を確認
Step 2: 直料率 > 0% の場合
  → その代理店に「直料率」を適用
Step 3: 直料率 = 0% の場合（自社から直接振込しない代理店）
  → 上位階層を辿り、直料率 > 0% の最初の代理店を見つける
  → その代理店に「直料率」を適用（繰り上げ処理）
Step 4: 直料率が適用された代理店より上位の全代理店に対して
  → 各代理店の「間接料率」を適用
Step 5: 料率 = 0% の代理店は分配明細に含めない（振込なし）
Step 6: 自社取り分 = 着金額 − 全代理店分配合計（※ビジネスモデルによる）
```

### 2.4 分配計算例

**前提**: A(1次) → B(2次) → C(3次)
**料率**: A(直10%, 間5%)、B(直10%, 間0%)、C(直0%, 間0%)

#### Aの紹介案件（売上240万）
| 分配先 | 種別 | 料率 | 金額 | 説明 |
|--------|------|------|------|------|
| A | 直 | 10% | 240,000 | 紹介者本人 → 直料率 |

#### Bの紹介案件（売上240万）
| 分配先 | 種別 | 料率 | 金額 | 説明 |
|--------|------|------|------|------|
| B | 直 | 10% | 240,000 | 紹介者本人 → 直料率 |
| A | 間 | 5% | 120,000 | Bの上位 → 間接料率 |

#### Cの紹介案件（売上240万）
| 分配先 | 種別 | 料率 | 金額 | 説明 |
|--------|------|------|------|------|
| C | 直 | 0% | 0 | 紹介者本人 → 直料率0% → **振込なし・繰り上げ** |
| B | 直 | 10% | 240,000 | C直0%のため繰り上げ → Bの直料率を適用 |
| A | 間 | 5% | 120,000 | Bの上位 → 間接料率 |

**繰り上げルール**: 直0%の代理店（C）は振込対象外。Cの上位で最初に直料率 > 0% のB が「直」として扱われる。Bより上のAは「間」。

### 2.5 イレギュラー対応

- 分配は自動計算後に**手動で追加・変更・削除が可能**
- 料率・金額の個別上書きに対応（`isManualOverride` フラグで記録）
- マスタと異なる料率を案件単位で適用できる

---

## 3. データモデル

### 3.1 ER図（概念）

```
PartnerBusinessLink
  + directCommissionRate     ← 直案件料率（マスタ）
  + indirectCommissionRate   ← 間接案件料率（マスタ）

Business ─┐
           ├─── AccountingPipeline ──── PipelineEntry ──── CommissionDistribution
Project ──┘                                                   + rateType (DIRECT/INDIRECT)
                                                              + isManualOverride
Partner ──────────────────────────────────────────────────────┘

PaymentStatement ──── PaymentStatementLine ──── CommissionDistribution
  + statementStatus: DRAFT → CONFIRMED → ISSUED
  + scheduledIssueDate
  + issuedAt
```

### 3.2 AccountingPipeline（会計パイプライン）

案件ごとの売上・報酬体系を管理するマスタレコード。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | Int (PK) | ✅ | 自動採番 |
| projectId | Int (FK → Project) | ✅ | 対象案件 |
| businessId | Int (FK → Business) | ✅ | 事業（Projectから取得、明示保持） |
| revenueType | Enum: `SHOT` / `STOCK` | ✅ | 単発 or 継続 |
| unitPrice | Decimal(12,2) | ✅ | 単価 |
| quantity | Int | ✅ | 個数（デフォルト: 1） |
| totalAmount | Decimal(14,2) | ✅ | 売上金額（unitPrice × quantity） |
| billingCycle | String? | ❌ | 着金サイクル（STOCKの場合: "毎月", "隔月", "隔週", "月2回" 等。自由入力） |
| paymentMethod | String? | ❌ | 支払い方法（"全額納品日", "分割" 等） |
| operationStartDate | DateTime? | ❌ | 運用開始日 |
| memo | String? | ❌ | 備考 |
| pipelineIsActive | Boolean | ✅ | 有効ステータス（デフォルト: true） |
| version | Int | ✅ | 楽観的ロック（デフォルト: 1） |
| createdAt | DateTime | ✅ | 作成日時 |
| updatedAt | DateTime | ✅ | 更新日時 |
| createdBy | Int? | ❌ | 作成者 |
| updatedBy | Int? | ❌ | 更新者 |

**制約**:
- `projectId` + `businessId` は一意（1案件1事業につき1パイプライン）

### 3.3 PipelineEntry（着金エントリ）

実際の着金1回を1レコードで記録。ショットなら1件、ストックなら着金のたびに追加。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | Int (PK) | ✅ | 自動採番 |
| pipelineId | Int (FK → AccountingPipeline) | ✅ | 親パイプライン |
| entryDate | DateTime (Date) | ✅ | 着金日 |
| amount | Decimal(14,2) | ✅ | 着金額 |
| periodYear | Int | ✅ | 対象年（締め処理用） |
| periodMonth | Int | ✅ | 対象月（締め処理用） |
| entryStatus | Enum: `DRAFT` / `CONFIRMED` | ✅ | ステータス（デフォルト: DRAFT） |
| entryMemo | String? | ❌ | 備考 |
| version | Int | ✅ | 楽観的ロック（デフォルト: 1） |
| createdAt | DateTime | ✅ | 作成日時 |
| updatedAt | DateTime | ✅ | 更新日時 |
| createdBy | Int? | ❌ | 作成者 |
| updatedBy | Int? | ❌ | 更新者 |

**ショット vs ストック**:
```
【ショット（単発）】
Pipeline (revenueType=SHOT)
  └→ Entry × 1件（着金日 + 金額）

【ストック（継続）】
Pipeline (revenueType=STOCK, billingCycle="毎月")
  ├→ Entry: 2026年4月 着金240万
  ├→ Entry: 2026年5月 着金240万
  ├→ Entry: 2026年6月 着金200万（変動もあり得る）
  └→ ...
```

**着金サイクル例**:
- 毎月 / 隔月 / 月2回 / 隔週 / その他（自由入力）
- 着金サイクルは参考情報。実際のEntryは手動追加（将来的に自動生成も検討可能）

### 3.4 CommissionDistribution（手数料分配）

着金エントリごとに「誰にいくら」を記録。階層数は無制限。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | Int (PK) | ✅ | 自動採番 |
| entryId | Int (FK → PipelineEntry) | ✅ | 親エントリ |
| partnerId | Int? (FK → Partner) | ❌ | 分配先（null = 自社取り分） |
| tier | Int | ✅ | 分配階層（1=自社, 2=BP1, 3=BP2, ...） |
| tierLabel | String? | ❌ | 階層ラベル（"社内", "BP1" 等。表示用） |
| rateType | Enum: `DIRECT` / `INDIRECT` | ✅ | 適用料率の種別（直/間） |
| commissionRate | Decimal(7,4) | ✅ | 適用料率 %（スナップショット） |
| commissionAmount | Decimal(14,2) | ✅ | 手数料額（着金額 × 料率 / 100） |
| isManualOverride | Boolean | ✅ | 手動上書きフラグ（デフォルト: false） |
| paymentDueDate | DateTime? | ❌ | 支払予定日 |
| paymentStatus | Enum: `PENDING` / `PAID` | ✅ | 支払状況（デフォルト: PENDING） |
| distributionMemo | String? | ❌ | 備考 |
| createdAt | DateTime | ✅ | 作成日時 |
| updatedAt | DateTime | ✅ | 更新日時 |

**自社取り分（partnerId = null, tier = 1）**:
- rateType: 固定で `DIRECT`（便宜上）
- 料率は明示的に設定するか、残余（着金額 - 全代理店分配合計）として自動計算

### 3.5 PaymentStatement（支払い明細）

月次・事業別・代理店別の支払い集計。確認→承認→PDF発行の単位。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | Int (PK) | ✅ | 自動採番 |
| partnerId | Int (FK → Partner) | ✅ | 支払先代理店 |
| businessId | Int (FK → Business) | ✅ | 事業 |
| periodYear | Int | ✅ | 対象年 |
| periodMonth | Int | ✅ | 対象月 |
| totalAmount | Decimal(14,2) | ✅ | 支払合計額 |
| statementStatus | Enum: `DRAFT` / `CONFIRMED` / `ISSUED` | ✅ | ステータス（後述） |
| scheduledIssueDate | DateTime? | ❌ | 発行予定日 |
| issuedAt | DateTime? | ❌ | 実際の発行日時 |
| pdfUrl | String? | ❌ | 生成PDFのURL（S3） |
| statementMemo | String? | ❌ | 備考 |
| version | Int | ✅ | 楽観的ロック（デフォルト: 1） |
| createdAt | DateTime | ✅ | 作成日時 |
| updatedAt | DateTime | ✅ | 更新日時 |
| createdBy | Int? | ❌ | 作成者 |
| updatedBy | Int? | ❌ | 更新者 |

**制約**:
- `partnerId` + `businessId` + `periodYear` + `periodMonth` は一意

**ステータスフロー**:
```
DRAFT（下書き）
  │  自動生成直後。明細行の確認・手修正が可能
  │  ↓ 確認完了
CONFIRMED（承認済み）
  │  内容確定。発行予定日を設定可能
  │  ↓ PDF発行
ISSUED（発行済み）
     PDF生成完了。発行日時を記録
```

- `DRAFT → CONFIRMED`: 明細内容を確認し承認
- `CONFIRMED → ISSUED`: PDF生成・発行（手動 or 発行予定日に基づく）
- `CONFIRMED → DRAFT`: 差し戻し（修正が必要な場合）
- `ISSUED` は原則変更不可（再発行は新規作成）

### 3.6 PaymentStatementLine（支払い明細行）

支払い明細の内訳行。手修正可能。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | Int (PK) | ✅ | 自動採番 |
| statementId | Int (FK → PaymentStatement) | ✅ | 親明細 |
| distributionId | Int? (FK → CommissionDistribution) | ❌ | 元の分配レコード（手動追加行はnull） |
| projectId | Int (FK → Project) | ✅ | 案件（表示用に明示保持） |
| amount | Decimal(14,2) | ✅ | 金額（手修正可能） |
| commissionRate | Decimal(7,4)? | ❌ | 料率（表示用） |
| lineDescription | String? | ❌ | 摘要 |
| isManualEntry | Boolean | ✅ | 手動追加行フラグ（デフォルト: false） |
| createdAt | DateTime | ✅ | 作成日時 |
| updatedAt | DateTime | ✅ | 更新日時 |

---

## 4. 業務フロー

### 4.1 基本フロー

```
[1] 案件成約
 │
 ▼
[2] 会計パイプライン作成
 │  - 案件を選択（成約済みの案件のみ）
 │  - 売上情報入力（単価 × 個数 = 金額）
 │  - 報酬タイプ選択（ショット / ストック）
 │  - ストックの場合: 着金サイクル入力
 │
 ▼
[3] 着金時 → エントリ追加
 │  - 着金日、着金額を入力
 │  - 手数料分配を自動計算（直/間ロジック + マスタ料率スナップショット）
 │  - イレギュラー対応: 分配先・料率の手動追加・変更・削除が可能
 │
 ▼
[4] 月次締め
 │  - 対象年月の全DRAFTエントリ → CONFIRMED に一括変更
 │  - 確定後は編集不可
 │
 ▼
[5] 支払い明細自動生成
 │  - 確定済みエントリの分配を代理店別・事業別に集計
 │  - PaymentStatement（DRAFT）+ PaymentStatementLine を自動作成
 │
 ▼
[6] 明細確認・手修正
 │  - 一覧画面で内容を確認
 │  - 必要に応じて金額・摘要を手修正、行の追加・削除
 │  - 問題なければ「承認」→ CONFIRMED
 │  - 発行予定日を設定（任意）
 │
 ▼
[7] PDF発行
    - CONFIRMED状態の明細に対してPDF生成
    - 発行予定日に基づく発行 or 手動発行
    - S3にアップロード → ダウンロード可能
    - ステータス → ISSUED、発行日時を記録
```

### 4.2 エントリ追加時の分配自動計算

```
1. 着金額を入力
2. 対象パイプラインの案件 → 紹介代理店（Project.partnerId）を取得
3. 紹介代理店の PartnerBusinessLink を取得（directCommissionRate, indirectCommissionRate）
4. 直料率を確認:
   a. directCommissionRate > 0 → その代理店に直料率を適用
   b. directCommissionRate = 0 → 上位階層を辿って直料率 > 0 の代理店を探す（繰り上げ）
5. 直料率適用代理店より上位の代理店に indirectCommissionRate を適用
6. 料率 = 0% の代理店はスキップ（分配明細に含めない）
7. 自社取り分を計算（tier=1, partnerId=null）
8. 全分配をCommissionDistributionに保存

※ 自動計算後に手動で追加・変更・削除が可能（isManualOverride=true で記録）
```

### 4.3 月次締めフロー

```
1. 対象事業・年月を選択
2. 当月のDRAFTエントリ一覧を表示（分配合計付き）
3. 確認 → 「月次確定」ボタン
4. 全DRAFTエントリ → CONFIRMED
5. 確定済みエントリのCommissionDistributionから支払い明細を自動生成
   - 代理店 × 事業 × 年月 で集計
   - PaymentStatement(DRAFT) + PaymentStatementLine を作成
```

### 4.4 支払い明細の確認・承認・発行フロー

```
[DRAFT] 自動生成直後
  ↓ 一覧画面で確認
  ↓ 手修正（金額変更、行追加/削除、摘要入力）
  ↓ 「承認」ボタン
[CONFIRMED] 承認済み
  ↓ 発行予定日を設定（任意）
  ↓ 「PDF発行」ボタン or 発行予定日到来
[ISSUED] 発行済み
  ↓ PDFダウンロード可能
```

---

## 5. 画面設計

### 5.1 画面一覧

| # | 画面名 | パス | 説明 |
|---|--------|------|------|
| 1 | 会計パイプライン一覧 | `/accounting` | 事業別・ステータス別のパイプライン一覧 |
| 2 | パイプライン詳細 | `/accounting/[id]` | 着金エントリ + 分配明細 |
| 3 | パイプライン新規作成 | `/accounting/new` | 案件選択 → 売上情報入力 |
| 4 | パイプライン編集 | `/accounting/[id]/edit` | 売上情報編集 |
| 5 | 月次締め | `/accounting/closing` | 月別の締め処理 |
| 6 | 支払い明細一覧 | `/payments` | 代理店別・月別の支払い明細。確認・承認操作 |
| 7 | 支払い明細詳細 | `/payments/[id]` | 明細行の確認・手修正 + PDF発行 |

### 5.2 会計パイプライン一覧

**フィルター**:
- 事業（グローバルセレクター連動）
- 報酬タイプ: 全て / ショット / ストック
- 期間: 着金日の範囲

**列**:
| 列名 | フィールド | 編集 |
|------|-----------|------|
| MO番号 | project.projectNo | リンク（案件詳細） |
| 顧客名 | project.customer.customerName | - |
| 代理店名 | project.partner.partnerName | - |
| 報酬タイプ | revenueType | - |
| 単価 | unitPrice | インライン |
| 個数 | quantity | インライン |
| 売上金額 | totalAmount | - (自動計算) |
| 着金サイクル | billingCycle | インライン |
| 直近着金日 | entries[最新].entryDate | - |
| 着金回数 | entries.count | - |

### 5.3 パイプライン詳細

**上部**: 案件情報サマリー（MO番号、顧客名、代理店名、売上金額、報酬タイプ、着金サイクル）

**中部: 着金エントリ一覧**
| 着金日 | 着金額 | 対象年月 | 分配合計 | ステータス | 操作 |
|--------|--------|---------|---------|-----------|------|
| 2026/04/15 | ¥2,400,000 | 2026年4月 | ¥480,000 | DRAFT | 編集 / 削除 |
| 2026/05/15 | ¥2,400,000 | 2026年5月 | ¥480,000 | CONFIRMED | - |

**下部: 分配明細（エントリ選択時に展開表示）**
| 階層 | 分配先 | 直/間 | 料率 | 金額 | 支払予定日 | 支払状況 | 手動 |
|------|--------|-------|------|------|-----------|---------|------|
| 社内 | （自社） | - | 7.50% | ¥180,000 | - | - | - |
| BP1 | ○○代理店 | 直 | 10.00% | ¥240,000 | 2026/05/31 | 未払い | - |
| BP2 | △△代理店 | 間 | 5.00% | ¥120,000 | 2026/05/31 | 未払い | - |
| **合計** | | | **22.50%** | **¥540,000** | | | |

- 「+ 分配先追加」ボタンで階層を動的に追加可能
- 各行の料率・金額を直接編集可能（手動上書き）

### 5.4 月次締め画面

1. 対象事業・年月を選択
2. 当月のDRAFTエントリ一覧を表示

| MO番号 | 顧客名 | 代理店名 | 着金日 | 着金額 | 分配合計 |
|--------|--------|---------|--------|--------|---------|
| MO-2 | ○○(株) | A代理店 | 4/15 | ¥2,400,000 | ¥480,000 |
| MO-39 | △△(株) | B代理店 | 4/20 | ¥4,800,000 | ¥960,000 |

3. 「月次確定」ボタン → エントリ確定 + 支払い明細自動生成

### 5.5 支払い明細一覧

**フィルター**: 事業 / 対象年月 / 代理店 / ステータス

| 代理店名 | 事業 | 対象年月 | 支払合計 | ステータス | 発行予定日 | PDF | 操作 |
|---------|------|---------|---------|-----------|-----------|-----|------|
| ○○代理店 | ライト事業 | 2026年4月 | ¥720,000 | DRAFT | - | - | 確認 |
| △△代理店 | ライト事業 | 2026年4月 | ¥120,000 | CONFIRMED | 5/15 | - | 発行 |
| □□代理店 | ライト事業 | 2026年3月 | ¥300,000 | ISSUED | - | 📄 | DL |

### 5.6 支払い明細詳細

**ヘッダー**: 支払先代理店名、事業名、対象年月、ステータス、発行予定日

**明細行テーブル（DRAFT時は編集可能）**:
| MO番号 | 顧客名 | 直/間 | 料率 | 金額 | 摘要 | 操作 |
|--------|--------|-------|------|------|------|------|
| MO-2 | ○○(株) | 直 | 10.00% | ¥240,000 | | 編集/削除 |
| MO-39 | △△(株) | 直 | 10.00% | ¥480,000 | | 編集/削除 |
| **合計** | | | | **¥720,000** | | |

- 「+ 行追加」ボタン（手動行の追加）
- 金額・摘要の直接編集
- 「承認」ボタン → CONFIRMED
- 「PDF発行」ボタン → PDF生成 → ISSUED

### 5.7 支払い明細PDF

```
┌──────────────────────────────────────────────────┐
│  支払い明細書                                     │
│                                                  │
│  支払先: ○○代理店 様                              │
│  登録番号: T1234567890123                         │
│  対象期間: 2026年4月                              │
│  事業: ライト事業                                 │
│                                                  │
│  ┌────────┬──────────┬──────┬──────┬───────────┐  │
│  │ MO番号 │ 顧客名   │ 直/間│ 料率 │ 支払金額  │  │
│  ├────────┼──────────┼──────┼──────┼───────────┤  │
│  │ MO-2   │ ○○(株)  │ 直   │ 10%  │ ¥240,000 │  │
│  │ MO-39  │ △△(株)  │ 直   │ 10%  │ ¥480,000 │  │
│  ├────────┼──────────┼──────┼──────┼───────────┤  │
│  │ 合計   │          │      │      │ ¥720,000 │  │
│  └────────┴──────────┴──────┴──────┴───────────┘  │
│                                                  │
│  発行日: 2026/05/15                               │
│  発行元: 株式会社○○                               │
└──────────────────────────────────────────────────┘
```

---

## 6. API設計

### 6.1 エンドポイント一覧

#### 会計パイプライン
| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/accounting-pipelines` | パイプライン一覧 |
| POST | `/api/v1/accounting-pipelines` | パイプライン作成 |
| GET | `/api/v1/accounting-pipelines/[id]` | パイプライン詳細（エントリ+分配含む） |
| PATCH | `/api/v1/accounting-pipelines/[id]` | パイプライン更新 |
| DELETE | `/api/v1/accounting-pipelines/[id]` | パイプライン削除（論理削除） |

#### 着金エントリ
| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/v1/accounting-pipelines/[id]/entries` | エントリ追加（分配自動計算） |
| PATCH | `/api/v1/accounting-pipelines/[id]/entries/[entryId]` | エントリ更新 |
| DELETE | `/api/v1/accounting-pipelines/[id]/entries/[entryId]` | エントリ削除 |

#### 手数料分配
| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/accounting-pipelines/[id]/entries/[entryId]/distributions` | 分配明細取得 |
| POST | `/api/v1/accounting-pipelines/[id]/entries/[entryId]/distributions` | 分配追加（手動） |
| PATCH | `/api/v1/accounting-pipelines/[id]/entries/[entryId]/distributions/[distId]` | 分配更新 |
| DELETE | `/api/v1/accounting-pipelines/[id]/entries/[entryId]/distributions/[distId]` | 分配削除 |

#### 月次締め
| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/v1/accounting-closing` | 月次締め実行（エントリ確定 + 支払い明細生成） |

#### 支払い明細
| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/v1/payment-statements` | 支払い明細一覧 |
| GET | `/api/v1/payment-statements/[id]` | 支払い明細詳細（行含む） |
| PATCH | `/api/v1/payment-statements/[id]` | 明細更新（ステータス変更、発行予定日設定） |
| POST | `/api/v1/payment-statements/[id]/lines` | 明細行追加（手動） |
| PATCH | `/api/v1/payment-statements/[id]/lines/[lineId]` | 明細行更新（金額・摘要修正） |
| DELETE | `/api/v1/payment-statements/[id]/lines/[lineId]` | 明細行削除 |
| POST | `/api/v1/payment-statements/[id]/issue` | PDF発行（生成 + ステータス更新） |
| GET | `/api/v1/payment-statements/[id]/pdf` | PDF取得（ダウンロード） |

### 6.2 主要リクエスト/レスポンス

#### POST /api/v1/accounting-pipelines
```json
{
  "projectId": 1,
  "revenueType": "SHOT",
  "unitPrice": 2400000,
  "quantity": 1,
  "billingCycle": null,
  "paymentMethod": "全額納品日",
  "operationStartDate": "2026-04-01",
  "memo": ""
}
```
※ `businessId` は `Project.businessId` からサーバー側で取得

#### POST /api/v1/accounting-pipelines/[id]/entries
```json
{
  "entryDate": "2026-04-15",
  "amount": 2400000,
  "periodYear": 2026,
  "periodMonth": 4
}
```
※ 分配はサーバー側で自動計算。レスポンスに計算結果を含む。

#### POST /api/v1/accounting-pipelines/[id]/entries/[entryId]/distributions (手動追加)
```json
{
  "partnerId": 30,
  "tier": 4,
  "tierLabel": "BP3",
  "rateType": "INDIRECT",
  "commissionRate": 3.0
}
```
※ `commissionAmount` はサーバー側で `amount × rate / 100` を計算。`isManualOverride` は自動でtrue。

#### POST /api/v1/accounting-closing
```json
{
  "businessId": 1,
  "periodYear": 2026,
  "periodMonth": 4
}
```

#### PATCH /api/v1/payment-statements/[id] (承認)
```json
{
  "statementStatus": "CONFIRMED",
  "scheduledIssueDate": "2026-05-15",
  "version": 1
}
```

---

## 7. ナビゲーション

サイドバーに追加:
```
📊 ダッシュボード
👥 顧客管理
🏢 代理店管理
📋 契約マスタ
💰 会計パイプライン    ← 新規
📄 支払い明細          ← 新規
🔄 ムーブメント
📅 ガントチャート
🎯 売上目標
📈 レポート
```

---

## 8. 実装フェーズ

### Phase 1: DB + 手数料率マスタ
- PartnerBusinessLink に `directCommissionRate` / `indirectCommissionRate` 追加
- 既存 `commissionRate` データの移行
- Prismaスキーマ追加（AccountingPipeline, PipelineEntry, CommissionDistribution, PaymentStatement, PaymentStatementLine）
- マイグレーション実行

### Phase 2: パイプライン API + 画面
- 基本CRUD API（パイプライン + エントリ + 分配）
- 分配自動計算ロジック（直/間判定 + 繰り上げ処理）
- フォーマッター作成
- 一覧画面（EntityListConfig活用）
- 詳細画面（エントリ + 分配の入れ子表示）
- 新規作成・編集フォーム

### Phase 3: 月次締め + 支払い明細
- 月次締めAPI + 画面
- 支払い明細自動生成ロジック
- 支払い明細一覧・詳細画面
- 明細の確認・手修正機能
- 承認ステータス管理

### Phase 4: PDF発行
- PDF生成（サーバーサイド）
- S3アップロード
- 発行予定日管理
- ダウンロード機能

### Phase 5: 統合・最適化
- ダッシュボード連携
- レポート連携
- パフォーマンス最適化
- 代理店管理画面への手数料率設定UI追加

---

## 9. 技術的考慮事項

### 9.1 金額計算
- 全ての金額計算はサーバーサイドで実施
- Decimal型で丸め誤差を防止
- 端数処理: 切り捨て（円未満）
- 分配合計と着金額の差分は自社取り分で調整

### 9.2 楽観的ロック
- AccountingPipeline, PipelineEntry, PaymentStatement に `version` フィールド
- PATCH時に409 Conflictで競合検知（既存パターンと同一）

### 9.3 PDF生成
- ライブラリ候補: `@react-pdf/renderer` または `puppeteer`（既存依存に合わせて選定）
- S3にアップロード（既存のファイルアップロード基盤を活用）

### 9.4 権限
- admin: 全操作可能
- staff: アサイン事業のパイプラインのみ閲覧・編集
- partner系ロール: アクセス不可（社内機能）

### 9.5 既存データとの整合性
- `Project.projectSalesStatus` が成約ステータスの案件のみパイプライン作成可能
- `PartnerBusinessLink.directCommissionRate` / `indirectCommissionRate` をデフォルト料率として自動セット
- `Partner.partnerInvoiceNumber`（登録番号 T+13桁）をPDF出力時に利用
- `PartnerBankAccount`（振込先口座情報）は将来的にPDFに含める可能性あり

### 9.6 代理店階層の辿り方
- `PartnerBusinessLink.businessParentId` で事業別の上位代理店を辿る
- `Partner.parentId` はグローバルな階層（事業別階層が優先）
- 繰り上げ処理時は事業別階層を使用
