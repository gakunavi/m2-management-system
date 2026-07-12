# 代理店報酬（会計）パイプライン 実装計画

作成: 2026-07-11 / 対象: m2-management-system

---

## 1. 確定した要件（ユーザー回答済み）

| 論点 | 決定 |
|---|---|
| 報酬の計算方式 | **率(%) または 固定額**。どちらをデフォルトにするかは**事業ごとに選べる**。案件ごとに上書き可（直・間接とも） |
| 報酬の確定タイミング | **案件の収益確定ラッチ**。ステータス定義の `isRevenueConfirmed=true` のステータスに変わった時点で `Project.revenueConfirmedAt` を自動セット。**一度セットされたらステータスを進めても戻しても自動では外れない（手動リセットのみ）**。sortOrder 非依存。報酬対象＝`revenueConfirmedAt` が入っている案件、計上月＝その日付（編集可）。月次締めで経理が確認・確定 |
| 階層報酬 | **2段オーバーライド**。子代理店Bが受注 → Bに「直紹介報酬」、親Aに「間接報酬」で**双方に別々に支払い** |
| 明細書の出力 | **xlsxのみ**。代理店への添付は手動（既存の請求書アップロード流用）。PDFは将来 |
| 位置づけ | **全事業共通のデフォルト機能**（一時的な機能ではない） |
| 税 | **一律 10% 外税**で開始（テンプレ準拠）。代理店別の課税/免税は将来 |
| 端数処理 | **円未満切り捨て** |
| 複数事業の代理店 | いったん**事業ごとに別々の明細** |
| 既存 `commissionRate` | schema にあるがマイグレーション未経由のドリフト列（率で運用中）。**直報酬へデータ移行してから削除**（案A） |

計算例（案件50万円をBが受注、Bは直紹介20%、Aは間接5%）:
- B（直紹介）= 500,000 × 20% = **100,000円**
- A（間接）= 500,000 × 5% = **25,000円**
- GakuNavi は B と A に別々に支払う

---

## 2. 現状調査（実装の土台）

| 項目 | 現状 | ファイル |
|---|---|---|
| 手数料率 | `PartnerBusinessLink.commissionRate` `Decimal(5,2)`（率%）が**保存・表示のみ、計算未使用** | `prisma/schema.prisma` / `partner-business-links-tab.tsx` |
| 代理店階層 | `PartnerBusinessLink.businessParentId` / `businessTier` で事業別の親子関係を保持済み | `schema.prisma` / `business-partner-hierarchy.ts` |
| 案件の金額 | 専用カラムなし。`projectCustomData` の中。どのキーが金額かは `businessConfig.revenueRecognition.amountField` が指す | `revenue-helpers.ts:108 getRevenueAmount` |
| 売上計上ロジック | `revenueRecognition = {statusCode, amountField, dateField}`。ステータス到達時に金額を計上月に集計 | `revenue-helpers.ts:140 calculateMonthlyRevenue` |
| 代理店スコープ | `getBusinessPartnerScope(partnerId, businessId)` が事業別階層で自分＋配下を返す | `revenue-helpers.ts:242` |
| ポータル金額表示 | 現状は「売上（案件金額）」を表示。**報酬表示は無い** | `portal/summary`, `portal/projects` |
| 代理店への添付基盤 | `BusinessDocument(documentType='invoice', partnerId=X)` ＋ notify で代理店ポータルに支払明細を出せる（**既存・手動アップロード運用**） | `businesses/[id]/documents`, `partner-invoices-tab.tsx`, `notify/route.ts` |
| 事業設定UI | タブ構成済み（`revenue-recognition-settings`, `status-definitions`, `project-fields` 等）。**報酬設定タブを追加できる** | `businesses/[id]/_client.tsx` |
| 帳票 | PDFライブラリ無し。`xlsx`(SheetJS) は導入済み | `package.json` |
| accountingページ | 空のスタブ（フォルダのみ）。新規で作る | `src/app/(auth)/accounting/` |
| 支払明細書テンプレ | 品目/数量/単価/合計 ＋ 消費税10% ＋ 合計。GakuNavi→代理店の成果報酬明細 | `支払明細書原本.xlsx`「見積書」シート |

---

## 3. アーキテクチャ設計

### 3.1 報酬設定の共通型と3層解決

報酬の1単位を **`RewardSetting = { type: 'rate' | 'fixed', value: number }`** で表す。
- `type='rate'` → 報酬 = ⌊案件金額 × value%⌋（円未満切り捨て）
- `type='fixed'` → 報酬 = value（固定額。案件金額に依らない）

「直紹介」「間接」それぞれについて、優先順に解決する（既存のカスタムフィールド3層と同型）:

1. **案件別上書き**（最優先）: その案件だけの `RewardSetting`
2. **代理店×事業リンク別**: `PartnerBusinessLink` の設定（未設定ならスキップ）
3. **事業デフォルト**: `Business.businessConfig.rewardConfig`（率 or 固定額を事業ごとに選択）

直紹介は「担当代理店のリンク」、間接は「親代理店のリンク」で解決する。

### 3.2 データモデル変更

**Business.businessConfig.rewardConfig**（JSON、新規キー）
```
rewardConfig: {
  direct:   { type: 'rate'|'fixed', value: number },  // 事業デフォルト（直紹介）
  indirect: { type: 'rate'|'fixed', value: number },  // 事業デフォルト（間接）
  taxRate: number,             // 一律 10
  baseAmountField?: string,    // 報酬率をかける「金額」フィールド。未指定なら primary KPI の sourceField
  rewardStatusCode?: string,   // 報酬確定の基準ステータス（未指定なら primary KPI の statusFilter）
}
```

**PartnerBusinessLink**（新設カラム、代理店×事業ごとの上書き）
- `directRewardType String?`（'rate'|'fixed'）, `directRewardValue Decimal(12,2)?`
- `indirectRewardType String?`, `indirectRewardValue Decimal(12,2)?`
- **既存 `commissionRate` は削除**。ただし移行マイグレーションで `commission_rate` が非NULLの行は `directRewardType='rate'` / `directRewardValue=commission_rate` へコピーしてから列を落とす（率で運用中のため安全）

**Project**（新設カラム、案件別上書き＝直・間接とも）
- `directRewardOverride Json?` = `{type, value}` | null
- `indirectRewardOverride Json?` = `{type, value}` | null
- 未設定なら リンク → 事業デフォルト にフォールバック
- `revenueConfirmedAt DateTime?` = **収益確定ラッチ**。`isRevenueConfirmed` ステータスへの遷移時に自動セット、手動リセットのみ解除。報酬対象判定＋計上月に使用（sortOrder 非依存）

**BusinessStatusDefinition**（新設カラム）
- `isRevenueConfirmed Boolean` = このステータスに変わると `Project.revenueConfirmedAt` を自動セットする「収益確定トリガー」。失注には付けない

**確定ラッチの挙動（Phase 2 の PATCH フックで実装）**
- 案件のステータス変更で、新ステータスが `isRevenueConfirmed=true` かつ `revenueConfirmedAt` が null → `revenueConfirmedAt = now()`（または指定日）
- ステータスが確定→非確定へ動いても `revenueConfirmedAt` は**保持**（自動で消さない）
- 手動で `revenueConfirmedAt` を編集/クリア可能（誤セットの訂正、過去月への計上、既存受注案件の登録に対応）

**RewardStatement（新規）** — 締め単位＝支払明細書1通
```
id, businessId, partnerId, periodMonth(YYYY-MM),
status('draft'|'confirmed'), 
totalDirect, totalIndirect, subtotal, taxAmount, grandTotal (Decimal 12,2),
statementNo(発行番号), fileStorageKey?, fileUrl?,  // 生成xlsx
confirmedAt?, confirmedBy?, version, createdAt, updatedAt
@@unique([businessId, partnerId, periodMonth])
```

**RewardEntry（新規）** — 明細行
```
id, statementId, projectId?,
entryType('direct'|'indirect'),
sourcePartnerId?,   // indirectのとき、どの配下代理店の成果か
projectNoSnapshot, customerNameSnapshot,  // 締め時点のスナップショット
baseAmount(案件金額), rate?(率、固定額のときnull), rewardAmount (Decimal 12,2),
createdAt
```

> 設計方針: **開いている期間（未締め）はライブ計算**でポータル・内部画面に表示。**締め（確定）時にスナップショット**して RewardStatement/RewardEntry に固定。確定後に案件金額が変わっても明細は動かない（再締めで差額調整は将来）。

### 3.3 報酬計算エンジン `src/lib/reward-helpers.ts`（revenue-helpers と対）

**⚠️ 計画レビューで判明した重要な訂正（2026-07-11）**
- 事業設定は**新形式 `kpiDefinitions` が現行**（seed も本番も）。`getRevenueRecognition`（旧 `revenueRecognition`）は kpiDefinitions 移行済み事業では **null を返す** → そのままだと報酬が一切計算されない。**基準は `getKpiDefinitions` の primary KPI（sourceField/statusFilter/dateField）を使う**。
- **1事業に複数KPIが併存**（例: 「売上金額」= proposed_amount と「導入台数」= unit_count）。金額でないKPI（台数）を報酬基準にすると `台数×%` で無意味。→ **報酬の基準フィールドは `rewardConfig.baseAmountField` で明示指定**（デフォルトは primary KPI の sourceField、ただし「円」フィールドを選べる）。参照: メモ「stats-api ライト事業の amount は台数の疑い」。
- 金額は `projectCustomData` に **number 型**で格納（seed 確認済み。`getRevenueAmount` は number 以外 0）。文字列保存の事業がないかは本番スポット確認。

関数:
- `getRewardBasis(businessConfig)` → `{ baseAmountField, statusCode, dateField }`（rewardConfig.baseAmountField 優先、無ければ primary KPI から。statusCode は rewardConfig.rewardStatusCode 優先）
- `resolveRewardSetting(kind, project, link, businessConfig)` → `RewardSetting`（3層解決）
- `applyRewardSetting(setting, baseAmount)` → `⌊amount×率⌋` または `固定額`（切り捨て）
- `computeProjectReward(project, amount, link, parentLink, businessConfig)` → `{ direct, indirect? }`
- `calculatePeriodRewards(businessId, fromMonth, toMonth)` → 代理店別集計
- 既存の `getRevenueAmount / getRevenueMonth` を再利用（金額取得・計上月の一貫性）

### 3.4 API

| メソッド/パス | 用途 |
|---|---|
| PATCH `businesses/[id]`（既存拡張） | `businessConfig.rewardConfig` の保存 |
| PATCH `partners/[id]/business-links/[linkId]`（既存拡張） | `directRewardType/Value` `indirectRewardType/Value` 追加、`commissionRate` 廃止（移行後）。GET・POST・一覧UI・作成ダイアログも差し替え |
| PATCH `projects/[id]`（既存拡張） | `directRewardOverride` `indirectRewardOverride` 追加 |
| GET `rewards?businessId=&from=&to=` | 内部集計（代理店別 直/間接/合計、期間指定） |
| GET `rewards/preview?businessId=&partnerId=&month=` | 明細プレビュー（ドリルダウン） |
| POST `rewards/statements`（確定/締め） | 期間をスナップショットして RewardStatement 生成 |
| GET `rewards/statements`, `/[id]` | 明細書一覧・詳細 |
| GET `rewards/statements/[id]/xlsx` | xlsx 生成・ダウンロード |
| GET `portal/rewards?businessId=&period=` | 代理店の自分の報酬（当月ライブ＋過去確定） |

認可: rewards 系は `requireInternalUser`（admin/staff）。portal/rewards は代理店ロール＋`getBusinessPartnerScope`（自分＋配下の直/間接のみ）。※既存の許可リスト `partner-api-allowlist.ts` に `portal/rewards` を追加。

### 3.5 UI

- **事業設定に「報酬設定」タブ**（`business/reward-config-tab.tsx`）: デフォルト直紹介率/間接率/税率。既存タブと同型
- **代理店×事業リンク編集**（`partner-business-links-tab.tsx` 既存に間接率カラム追加）
- **案件編集に報酬上書き**（固定額/率）: 案件フォーム/インライン
- **報酬管理画面（新規 `accounting/` or `rewards/`）**: 期間指定 → 事業別・代理店別の報酬一覧、ドリルダウン、締め/確定ボタン、xlsx出力、明細書一覧
- **代理店ポータルに「報酬」セクション**: 当月見込み＋過去確定分（直/間接の内訳）

### 3.6 xlsx 生成 `src/lib/reward-statement-xlsx.ts`

SheetJS で提供テンプレ「見積書」シート構造を再現:
- ヘッダ: 支払明細書 / 宛先=代理店 / 発行元=GakuNavi / 発行番号 / お支払い金額 / お振込年月日
- 明細: 品目(=案件 or 成果) / 数量 / 単価(=報酬額) / 合計
- 小計 → 消費税10% → 合計
- 直紹介分・間接分を品目行で区別（例: 「[間接] 案件XXX（B社経由）」）

---

## 4. フェーズ分割とモデル割り当て

> 割り当て指針: **金銭計算の正確性がクリティカルな中核ロジック = Opus**、**既存パターンに沿う機能実装 = Sonnet**、**機械的な配線・CRUD雛形・テストデータ = Haiku**。

### Phase 0 — スキーマ設計 & マイグレーション　【モデル: Opus 4.8】
- 3.2 のスキーマ変更、報酬解決モデル・締めの整合性の最終確定、マイグレーション作成
- **Opus 理由**: 報酬率の3層解決・スナップショット整合性・階層の親子解決は、後戻りコストが高い設計判断。ここを誤ると全体が歪む
- 成果物: `schema.prisma` 変更 + マイグレーション + 設計確定メモ

### Phase 1 — 報酬計算エンジン `reward-helpers.ts` ＋ 単体テスト　【モデル: Opus 4.8】
- 3.3 の関数群、2段オーバーライド、固定額/率の分岐、税計算、端数処理
- **Opus 理由**: **金銭計算の中核**。階層報酬・上書き・税・端数はバグると実損害。網羅的な単体テスト（境界値・端数・親不在・上書き）まで Opus で作り込む
- 成果物: `reward-helpers.ts` + `tests/lib/reward-helpers.test.ts`（高カバレッジ）

### Phase 2 — 設定UI・API（率の入力経路）　【モデル: Sonnet 5】
- 事業デフォルト率タブ、リンク別間接率カラム、案件別上書きフィールド、対応するPATCH拡張
- **Sonnet 理由**: 既存のConfig駆動・タブ・インラインPATCHパターンの踏襲。パターンが確立しており Sonnet の実装効率が活きる
- 依存: Phase 0

### Phase 3 — 内部の報酬集計画面　【モデル: Sonnet 5】
- 期間指定 → 代理店別 直/間接/合計 の一覧、ドリルダウン、`GET /rewards`
- **Sonnet 理由**: 既存の一覧/フィルタ/テーブル基盤（EntityListTemplate等）を再利用する画面実装
- 依存: Phase 1

### Phase 4 — 締め・確定 & スナップショット　【モデル: Opus 4.8（コア）＋ Sonnet（UI）】
- `POST /rewards/statements` で期間確定 → RewardStatement/RewardEntry 生成、楽観ロック、二重確定防止、トランザクション
- **Opus 理由**: スナップショットの整合性・確定の冪等性・同時実行はデータ整合クリティカル。確定後の不変性保証も
- UI（確定ボタン・状態表示）は Sonnet
- 依存: Phase 1, 3

### Phase 5 — xlsx 明細書生成　【モデル: Sonnet 5（雛形は Haiku 可）】
- `reward-statement-xlsx.ts`、テンプレ構造の再現、`GET /rewards/statements/[id]/xlsx`
- **Sonnet 理由**: データ形状が Phase 4 で確定していれば、テンプレ埋め込みは定型作業。セル配置の初期雛形は Haiku でも可
- 依存: Phase 4

### Phase 6 — 代理店ポータルの報酬表示　【モデル: Sonnet 5】
- `portal/rewards` API＋ポータルUI、許可リスト追加、当月ライブ＋過去確定、直/間接内訳
- **Sonnet 理由**: 既存ポータル（summary/documents）と同じ認可・スコープ・表示パターン
- 依存: Phase 1, 4

### 補助タスク　【モデル: Haiku 4.5】
- ナビ追加、許可リスト1行追加、seed に報酬設定サンプル、リンク一覧への率カラム表示配線 等の機械的作業

---

## 5. 確定済みの方針 / 将来対応

**確定済み**
1. 税: 一律 10% 外税
2. 締め単位: 月次 × 事業 × 代理店（複数事業の代理店は事業ごとに別明細）
3. 案件別上書き: **直・間接とも**上書き可
4. 報酬方式: 率/固定額を**事業ごとに選択**（直・間接それぞれ）
5. 端数処理: **円未満切り捨て**
6. 既存 `commissionRate`: 直報酬へ移行してから削除
7. 報酬確定の基準ステータス: 既定で `revenueRecognition.statusCode` を流用（受注）。事業別に変えたい場合は `rewardConfig.rewardStatusCode`

**将来対応（今回はスコープ外）**
- 代理店別の課税/免税（インボイス番号ベース）
- 確定後の金額変更に対する差額調整（赤黒）
- 複数事業をまたぐ1通統合明細
- PDF出力・代理店への自動添付（承認連動）
- 3段以上の多段オーバーライド

**Phase 4 で確定**: 発行番号の採番規則（事業×年月×連番 等）

---

## 5.5 計画レビュー結果（2026-07-11、fable による独立チェック）

**重大（実装に反映済み／要ユーザー確認）**
1. ✅反映: 金額ソースは `revenueRecognition` でなく **`kpiDefinitions` の primary KPI**。旧関数依存だと報酬0になる事業がある
2. ✅反映: 「金額」が円とは限らない（台数KPIあり）→ `rewardConfig.baseAmountField` で明示
3. ✅**解決済**: 報酬対象は `BusinessStatusDefinition.isRevenueConfirmed=true` のステータスの案件で判定（exact-status-match は使わない）。事業ごとに受注・納品完了・入金済など「収益確定」ステータスに複数チェック可 → 案件が受注→納品と進んでも、それらを確定扱いにしておけば報酬は維持。失注は付けないので除外。Phase 0 でフラグ列を追加済み。計上月は収益確定日フィールド→無ければ `projectStatusChangedAt`→締めスナップショットで固定
4. ✅確認済: 金額は number 型で格納（seed）。文字列保存の事業がないか本番スポット確認
5. ⚠️反映予定: 計上日(dateField)未設定の受注案件は月=null で**黙って除外**→報酬0。締め画面で「計上日未設定の受注案件」を警告表示する

**中程度**
6. 間接報酬で子の売上額が親に見える（`RewardEntry.sourcePartnerId` + `baseAmount`）。オーバーライド報酬の性質上妥当だが、ポータルで親に見せる粒度（金額 or 報酬額のみ）を決める
7. **xlsx はテンプレの見た目を完全再現できない**（SheetJS 無料版は罫線・セル書式・画像・結合の再現に制約）。ロゴ・印影・枠線は入らない。機能的明細は作れるが「原本そっくり」にはならない（ユーザーの「xlsxのみ・PDF将来」選択とは整合）

**軽微**
8. 親リンク解決 = `businessParentId(Partner.id)` → 同一事業の `PartnerBusinessLink(partnerId=親)`。親が `linkStatus≠active`／未リンクなら間接報酬なし、で良いか確認
9. commissionRate 削除は API 2・UI 2（一覧インライン編集＋作成ダイアログ）・seed を全差し替え（Phase 2）

---

## 6. 想定規模感（目安・未検証）

- Phase 0-1（Opus、中核）が品質の要。ここに最も時間を割く
- Phase 2-3, 6（Sonnet）は既存パターン流用で効率的
- Phase 4 は整合性設計が肝（Opus）
- Phase 5 は xlsx 定型
- 全Phaseで既存の検証フロー（型・テスト・使い捨てDB・本番相当リハーサル）を適用
