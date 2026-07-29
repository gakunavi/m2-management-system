# 経営統計 API（strategy-report）仕様書

経営戦略室の AI（Claude Cowork）が月次レビューで営業 KPI を自動取得するための **read-only** 集計 API。

- 実装: `src/app/api/stats/strategy-report/route.ts`
- 認証: `Authorization: Bearer <STATS_API_TOKEN>`（機械アクセス専用 / NextAuth セッションは適用しない）
- 読み取り専用。このエンドポイントから DB 書き込み・スキーマ変更は一切行わない。
- 顧客の個人情報・会社名は返さない（`customer_ref` は匿名 ID のみ）。代理店名は実名。

---

## 1. エンドポイント

```
GET /api/stats/strategy-report?months=6
GET /api/stats/strategy-report?from=2026-07&to=2026-12     # 任意区間（未来を含められる）
GET /api/stats/strategy-report?months=3&months_ahead=6     # 過去3ヶ月 + 当月から先6ヶ月
```

| パラメータ | 必須 | 既定 | 範囲 | 説明 |
|-----------|------|------|------|------|
| `months`  | 任意 | 6    | 1〜24（範囲外は自動クランプ） | 集計対象期間（当月を含む過去 N ヶ月） |
| `from` / `to` | 任意 | — | 最大 24 ヶ月 | `YYYY-MM`。任意区間（未来可）。**両方セットで指定**。`months` より優先 |
| `months_ahead` | 任意 | 0 | 0〜24（超過はクリップ） | 当月を含む先 N ヶ月ぶん、期間の末尾を延長する |

### 期間指定のルール

- **`months` 単独の挙動は従来と完全に同一**（`period.to` はリクエスト日の日付）。
- `from`/`to` と `months` が同時に来たら **`from`/`to` を優先**。
- `from`/`to` は **片方だけの指定・不正な形式・逆転・24 ヶ月超は `400`**（エラーメッセージ付き）。
  未来側を黙って切り詰めると「12 月まで指定したのに 10 月までしか返っていない」ことに
  気づけないため、クランプではなくエラーにしている。
- `months_ahead` は上限超過時にクリップし、`notes` に明記する
  （`months` との合計が 24 ヶ月を超える場合、未来側を縮める）。
- `period.from` / `period.to` は **解決後の実区間**。未来を含む指定では `period.to` は月末日。

| リクエスト | 返る期間 |
|-----------|---------|
| `?months=6`（当月 2026-07） | `2026-01-01` 〜 `2026-07-29`（リクエスト日） |
| `?from=2026-07&to=2026-12` | `2026-07-01` 〜 `2026-12-31` |
| `?months=3&months_ahead=6` | `2026-04-01` 〜 `2026-12-31` |
| `?months_ahead=1` | 当月まで（延長なし。「当月を含む先 1 ヶ月」＝当月のみ） |

### 認証ステータス

| 状況 | ステータス |
|------|-----------|
| `STATS_API_TOKEN` 未設定（エンドポイント無効化） | `404` |
| トークン不一致 / `Authorization` ヘッダ無し | `401` |
| 認証成功 | `200` + JSON |

### 集計対象事業

`STATS_BUSINESS_CODE`（env）で **安定キー `businessCode`** を指定し、リクエスト時に解決する。
`Business.id`（autoincrement）はローカル/ステージング/本番でズレるため直書きしない。

- 本番のライト事業: `STATS_BUSINESS_CODE=LIGHT`（事業名「ライト事業」。本番事業マスタで確認済み）
- **大文字小文字は区別しない**（`equals + mode:'insensitive'`）。`LIGHT` / `light` / `Light` のいずれでも解決する。表記揺れによる「静かな空データ」を防ぐ目的。
- **デプロイ後に下記「6. 動作確認」で `business.name` が「ライト事業」になることを確認する**こと。null の場合は env の値を修正（コード再デプロイ不要・タスク定義の env 更新のみ）。
- `STATS_BUSINESS_CODE` 未設定 / 該当事業なし → `200` で `business: null` + `notes` に理由を記載（クラッシュさせない）

---

## 2. レスポンス・フィールドマッピング

事業ごとの「金額フィールド・成約ステータス・計上月」はすべて `Business.businessConfig` 駆動（ハードコードしない）。

| フィールド | 取得元 | 備考 |
|-----------|--------|------|
| `generated_at` | サーバ時刻（JST, +09:00） | |
| `business.code` / `.name` | `businesses.business_code` / `business_name` | |
| `period.from` | 当月の `months` ヶ月前の月初 | |
| `period.to` | リクエスト時刻の日付 | |
| `pipeline.by_stage[].stage` | `business_status_definitions.status_label`（`projects.project_sales_status` で解決） | 既存値そのまま（正規化しない） |
| `by_stage[].count` | `projects`（`project_is_active=true`）を status で集計 | |
| `by_stage[].amount_total` | `projects.project_custom_data[<金額フィールド>]` の合計 | 金額フィールド = primary KPI の `sourceField`。KPI 未設定なら `null` |
| `pipeline.by_agent[].agent` | `partners.partner_name`、`partner_id=null` → `"直販"` | 実名 |
| `by_agent[].partner_id` | `projects.partner_id`（=`partners.id`） | 突合用内部 ID。直販 → `null` |
| `by_agent[].lineage` | 系列名。親を根まで遡った最上位代理店（1次店）の `partners.partner_name`。親解決は多段（下記参照） | 直販 → `"直販"`。親が無い代理店は1次店＝自社名（未分類にしない） |
| `by_agent[].tier` | `partner_business_links.business_tier`（表示用に `partners.partner_tier` で補完） | 既存値そのまま（例: `1次代理店`/`2次代理店`）。無し → `null` |
| `by_agent[].referrer` | 直接の親の `partner_name`（親解決は多段、下記参照） | 1次店 → `null` |
| `by_agent[].referrer_partner_id` | 直接の親の partner_id | 1次店 → `null` |
| `by_agent[].active_deals` / `.stages` | partner × status で集計 | |
| `pipeline.by_lineage[].lineage` | 系統名（上記 `by_agent[].lineage` と同じ算出） | 直販/未分類を含む |
| `by_lineage[].partner_count` | その系統内のユニーク代理店数 | |
| `by_lineage[].agents[]` | その系統の代理店名リスト | |
| `by_lineage[].active_deals` | その系統のアクティブ案件合計 | |
| `by_lineage[].closed_units_period` | 期間内成約の台数（`unit_count`）合計 | 台数フィールド未解決 → `null` |
| `by_lineage[].active_share` | 当該系統 `active_deals` ÷ 全系統 `active_deals` 合計（小数3桁） | |
| `closed_deals[]` | 成約ステータス案件のうち計上月が期間内のもの（1 案件 = 1 エントリ） | |
| `closed_deals[].closed_month` | `getRevenueMonth()`（KPI `dateField`、無ければ `project_expected_close_month`） | |
| `closed_deals[].agent` | partner_name / 直販 | |
| `closed_deals[].lineage` | `by_agent[].lineage` と同じ系統名 | 直販 → `"直販"` / 未分類 |
| `closed_deals[].tier` | `by_agent[].tier` と同じ階層 | |
| `closed_deals[].units` | `project_custom_data.unit_count`（台数） | フィールド無し → `null` |
| `closed_deals[].amount` | `project_custom_data[<金額フィールド>]` | |
| `closed_deals[].lead_time_days` | **算出せず `null`** | 専用の成約日カラムが存在しないため |
| `closed_deals[].customer_ref` | `"cust_" + customer_id`（匿名） | 会社名・コードは返さない |
| `monthly_summary[].new_deals` | `projects.created_at` が当月 | |
| `monthly_summary[].closed` | 成約案件で計上月が当月 | |
| `monthly_summary[].lost` | 失注案件で `project_status_changed_at` が当月 | |
| `monthly_summary[].close_rate` | `closed / (closed + lost)`（当月決着分の成約率、小数3桁） | 新規数を分母にしていない |
| `lead_time.{avg,min,max}_days` | **`null`**（成約日カラム無し） | |
| `lead_time.n` | `closed_deals` の件数 | |
| `notes` | スキーマ上取得できない / 代替した項目の理由 | |

### `revenue` セクション（収益: 取扱高・自社売上・代理店手数料・粗利）

**計算は管理画面ダッシュボードの収益セクション（`/api/v1/dashboard/profit`）と同一実装**
（`src/lib/profit-helpers.ts` の `calculateBusinessMonthlyPL` / `calculateBusinessProjectMonthPL`）。
統計 API 側に計算式は書かない（二重実装で画面と数字が食い違うのを防ぐため）。

```jsonc
"revenue": {
  "basis": {
    "kpi_label": "受注見込み金額",
    "amount_field": "total_amount",          // 取扱高の参照フィールド
    "date_field": "expected_order_month",    // 計上月を決めるフィールド（予定か着金かの判定に必須）
    "status_codes": ["3_内諾", "4_受注"],     // 計上対象の営業ステータス（確定か見込みかの判定に必須）
    "status_labels": ["内諾", "受注"],
    "company_share_configured": true
  },
  "by_month":   [ /* 期間内の全月。実績が無い月も 0 で並ぶ */ ],
  "by_project": [ /* 期間内に計上のある「案件 × 計上月」。取扱高の降順。件数上限なし */ ],
  "by_partner": [ /* 担当代理店別ロールアップ。取扱高の降順 */ ],
  "totals":     { /* by_month と同じキー構成の期間合計 */ }
}
```

| フィールド | 取得元 / 意味 |
|-----------|--------------|
| `basis.kpi_label` / `.amount_field` / `.date_field` / `.status_codes` | `resolveProfitBasis()`（プライマリ KPI ＋ 事業マスタの「収益の計上対象ステータス」上書き） |
| `basis.company_share_configured` | `rewardConfig.companyShare` が設定済みか（ダッシュボードの `enabled` と同一判定） |
| `by_month[].gmv` | 取扱高（税抜） |
| `by_month[].units` | 台数。**案件の計上初月に1回のみ**計上（ストック展開した月には乗せない）。台数フィールド未解決 → `null` |
| `by_month[].company_revenue` | 自社売上 = 取扱高 × 自社取り分 |
| `by_month[].reward_direct` / `.reward_indirect` / `.reward_total` | 担当代理店ぶん / 上位代理店ぶん / 合計（階層を最上位まで遡って積み上げ） |
| `by_month[].gross_profit` | 粗利 = 自社売上 − 手数料合計 |
| `by_month[].gross_margin` | 粗利 ÷ 自社売上（%、小数1桁）。自社売上 0 → `null` |
| `by_month[].gross_margin_on_gmv` | 粗利 ÷ 取扱高（%、小数1桁） |
| `by_month[].project_count` | その月に計上があった案件数 |
| `by_project[].project_no` / `.customer_ref` | 案件番号 / 顧客の匿名 ID（`cust_<customer_id>`。**顧客名・会社名は返さない**） |
| `by_project[].month` / `.is_recognition_month` | 計上月 / それが計上初月か |
| `by_project[].sales_status` / `.sales_status_label` | 営業ステータス（確度の判定用） |
| `by_project[].partner` / `.lineage` / `.tier` | 担当代理店名（実名。代理店なし → `null`）/ 系列 / 階層 |
| `by_partner[]` | 担当代理店別の合計。代理店なし（直販）は `partner: null` の1行 |
| `totals` | 期間合計。`company_share_configured: false` のときは **`null`**（0 ではない） |

#### 計上基準（`basis`）の読み方 — ここを読まずに数字を使わない

- `status_codes` … **どのステータスまで含んだ数字か**。確定売上か見込みかはこれで判断する。
  `null` は「ステータスで絞っていない（全ステータスが計上対象）」の意味。
- `date_field` … **予定月か着金月か**。例: 「受注予定月」なら予定ベース。
- `company_share_configured` … `false` の事業は **集計対象外**。`by_month` / `by_project` / `by_partner` は
  空配列、`totals` は `null` を返す。**0 で埋めない**（未設定と 0 は別の意味。0 で埋めると「粗利ゼロ」に見える）。
  理由（rewardConfig 自体が無い / companyShare が未設定）は `notes` に書く。

#### 突合時の注意（必ず引っかかる点）

- **`by_month[].project_count` の合計と `by_project` の行数は一致しない。**
  ストック（継続課金）案件は契約継続中の各月に計上されるため、1 案件が複数月に現れる。
  案件単位で数えるときは `project_no` をユニークにする（`is_recognition_month: true` が計上初月）。
- `revenue` の母集団は「有効な案件（`project_is_active=true`）かつ `basis.status_codes` に合致し
  計上月が決まるもの」。`pipeline` / `closed_deals` とは条件が違うので件数は一致しない。
- 金額は**税抜**（消費税は預り金なので粗利から引かない）。
- `revenue` は `months=6` などの既存呼び出しでも**常に返る**（レスポンス形状は1つ）。

### 成約 / 失注ステータスの判定

`businessConfig` に明示の成約コードが無い場合のフォールバック:

- **成約** = `business_status_definitions.status_is_final = true` かつ `status_is_lost = false`
- **失注** = `status_is_lost = true`

### 代理店の系列（lineage / tier / referrer）の解決 — 親の多段フォールバック

「系列(lineage)」には **専用カラムが存在しない**。親を根まで遡った最上位代理店（＝1次店）の `partner_name` を系列名とする派生値。本 API は単一事業スコープ。

**親の解決は「事業ごとの紐付け」を優先しつつ、データ欠落に堅牢な多段フォールバック:**

1. `partner_business_links.business_parent_id`（**事業別の明示FK**。最優先）
2. `partner_business_links.business_tier_number` の接頭辞から親を復元（**親FKは空だが階層番号は付与済み**のデータ対策。`"AG-0001-1"` → 親の階層番号 `"AG-0001"` を持つ代理店）
3. `partners.parent_id`（**グローバルの親代理店**。事業別リンク側に階層が入っていない代理店の保険）
4. いずれも無ければ **1次店＝自分自身が系列の根**（自社名が系列名。「未分類」には落とさない）

> **なぜ多段か**: 実データでは系列の親子が **事業別リンク側に入っている代理店**（例: SHELP 系列）と、**グローバルの代理店マスタ側に入っている代理店**（例: ライフサポート系列・BCM 系列＝`business_parent_id` が空で `partners.parent_id` のみ設定）が混在していたため。①②（事業別）を優先し、無い場合のみ③（グローバル）を見るので「事業ごとの紐付け優先」は保たれる。

- **`tier`**: `business_tier`（無ければ表示用に `partner_tier`）の **既存値そのまま**（正規化・英訳しない）。
- **`referrer` / `referrer_partner_id`**: 上記で解決した **直接の親**の名前と ID。1次店は `null`。
- **直販**（`partner_id=null` の案件）→ 系列 `"直販"` の独立グループ（tier/referrer は `null`）。
- `by_lineage[].active_share` の分母は **全系列 `active_deals` の合計**（= アクティブ案件総数。各案件は 1 系列に属する）。
- 対象は `link_status='active'` の事業リンク（アプリの代理店グループツリーと整合）。

> **別事業を見たい場合**は `STATS_BUSINESS_CODE` を切り替える（系列は事業ごとに独立）。

### 取得できない / 代替した項目（`notes` に明記される）

1. **`lead_time`**: 専用の成約日カラムが無いため算出しない（`null`）。
2. **`amount`**: 固定カラム無し。**取扱高の基準金額フィールド**（`businessConfig.rewardConfig.shotBaseField`）→ 無ければプライマリ KPI の `sourceField` の順で解決。未設定なら `null`。
3. **`units`**: 任意カスタム項目 `unit_count`。欠損時 `null`。
4. **`close_rate`**: 仕様に定義が無いため「成約数 /（成約数＋失注数）」を採用。
5. **`lineage`**: 専用カラム無し。親子チェーンの根から導出（上記「代理店の系統」参照）。

---

## 3. トークンの発行・ローテーション

### 発行

```bash
# 32バイトのランダム値を生成
openssl rand -hex 32
```

生成値を `STATS_API_TOKEN` として Secrets Manager に登録（本番）/ `.env`（ローカル）に設定する。
消費者（Claude Cowork）には同じ値を `Authorization: Bearer <値>` として共有する。

### ローテーション手順

1. 新しい値を `openssl rand -hex 32` で生成。
2. Secrets Manager のシークレットを更新（下記コマンド）。
3. ECS サービスを再デプロイ（新タスクが新トークンを読み込む）。
4. 消費者（Cowork）側の保存トークンを差し替える。
5. 旧トークンでの `401` を確認。

```bash
# 環境A
aws secretsmanager put-secret-value \
  --secret-id m2/stats-api-token \
  --secret-string "$(openssl rand -hex 32)"

# 環境B
aws secretsmanager put-secret-value \
  --secret-id m2b/stats-api-token \
  --secret-string "$(openssl rand -hex 32)"
```

---

## 4. ECS タスク定義への追加手順

### 4.1 Secrets Manager にトークンを登録

```bash
# 環境A（account 480845173144 / prefix m2/）
aws secretsmanager create-secret \
  --name m2/stats-api-token \
  --secret-string "$(openssl rand -hex 32)"

# 環境B（account 367012942826 / prefix m2b/）
aws secretsmanager create-secret \
  --name m2b/stats-api-token \
  --secret-string "$(openssl rand -hex 32)"
```

> `STATS_BUSINESS_CODE` は機密ではない識別子（`LIGHT`）なので Secrets Manager ではなく
> タスク定義の `environment` に平文で記載する。

### 4.2 `.aws/task-definition*.json` を編集

`containerDefinitions[0].secrets` に `STATS_API_TOKEN` を追加（`valueFrom` の ARN は
`create-secret` 出力の完全 ARN。末尾のランダムサフィックス付き）:

```jsonc
// secrets[] に追記
{
  "name": "STATS_API_TOKEN",
  "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:<ACCOUNT_ID>:secret:<PREFIX>/stats-api-token-XXXXXX"
}
```

`containerDefinitions[0].environment` に `STATS_BUSINESS_CODE` を追加:

```jsonc
// environment[] に追記
{ "name": "STATS_BUSINESS_CODE", "value": "LIGHT" }
```

### 4.3 タスク実行ロールの権限

タスク実行ロールの Secrets Manager インラインポリシーは
`m2/*` / `m2b/*` をワイルドカードで許可済みのため、`*/stats-api-token` も追加権限なしで読める
（`docs/aws-env-b-setup.md` Step 2.1 参照）。

### 4.4 デプロイ

通常のデプロイフロー（GitHub Actions `deploy.yml` / `deploy-b.yml`）で新タスク定義を反映。

---

## 5. ローカル検証

ローカル DB にはライト事業が無いため、検証用事業（例: `moag`）で動作確認する。

```bash
# 別ポートで起動（既存 dev サーバを止めない場合）
STATS_API_TOKEN=testtoken123 STATS_BUSINESS_CODE=moag PORT=3100 npm run dev

# 1) トークン無し → 401
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3100/api/stats/strategy-report?months=6"

# 2) 不正トークン → 401
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer wrong" \
  "http://localhost:3100/api/stats/strategy-report?months=6"

# 3) 正しいトークン → 200 + JSON
curl -s -H "Authorization: Bearer testtoken123" \
  "http://localhost:3100/api/stats/strategy-report?months=6" | python3 -m json.tool
```

`STATS_API_TOKEN` を空にして起動すると、同じパスが `404` を返す（エンドポイント無効化）ことも確認できる。

```bash
# 4) 期間パラメータ（400 になるケース）
#    片方だけ / 形式不正 / 逆転 / 24ヶ月超 はすべて 400 + error メッセージ
curl -s -H "Authorization: Bearer testtoken123" \
  "http://localhost:3100/api/stats/strategy-report?from=2026-07" | python3 -m json.tool

# 5) 未来を含む区間
curl -s -H "Authorization: Bearer testtoken123" \
  "http://localhost:3100/api/stats/strategy-report?from=2026-07&to=2026-12" | python3 -m json.tool
```

> **ローカル DB では `revenue` の中身までは検証できない。**
> 検証用事業に自社取り分（`rewardConfig.companyShare`）が設定されていないため、
> `company_share_configured: false` の分岐（空配列 + `totals: null`）しか通らない。
> 集計ロジック自体は DB 非依存のユニットテストで担保している:
> `tests/lib/profit-helpers.test.ts`（案件×月の展開・月次との一致）と
> `tests/lib/stats-revenue.test.ts`（ゼロ埋め・台数の重複回避・代理店別ロールアップ・合計整合）。
> 実データとの突合は「6. 本番デプロイ後の確認」で行う。

---

## 6. 本番デプロイ後の確認

```bash
# <DOMAIN> は対象環境のドメイン（例: 環境B = manage.1quon.com）
# <TOKEN> は Secrets Manager に登録した STATS_API_TOKEN の値

# 200 + JSON が返ることを確認
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://<DOMAIN>/api/stats/strategy-report?months=6" | python3 -m json.tool

# 認証が効いていることを確認（401）
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<DOMAIN>/api/stats/strategy-report?months=6"
```

確認ポイント:

- `business.name` がライト事業になっているか（`STATS_BUSINESS_CODE` の解決確認）。
- `notes` に想定外の「取得できない」記述が無いか（特に `amount` が `null` でないか＝KPI 設定の有無）。
- `customer_ref` が `cust_<数字>` の匿名形式で、会社名・顧客コードが含まれていないこと。

### 6.1 `revenue` をダッシュボードと突合する（必須）

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://<DOMAIN>/api/stats/strategy-report?from=2026-08&to=2026-08" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['revenue']['by_month'], ensure_ascii=False, indent=2))"
```

管理画面の**収益セクションで同じ月**を表示し、**1 円単位で一致**することを確認する。

| キー | 突合先（管理画面の収益セクション） |
|------|--------------------------------|
| `gmv` | 取扱高 |
| `company_revenue` | 自社売上 |
| `reward_direct` / `reward_indirect` / `reward_total` | 担当代理店 / 上位代理店 / 手数料合計 |
| `gross_profit` / `gross_margin` / `gross_margin_on_gmv` | 粗利 / 粗利率（自社売上比）/ 粗利率（取扱高比） |
| `project_count` | 案件数 |

一致しない場合に最初に見るところ:

1. **期間**: ダッシュボードは期間フィルター、統計 API は `from`/`to`。同じ月になっているか。
2. **事業**: ダッシュボードは全事業合算になり得る（`businessId` 未指定時）。統計 API は
   `STATS_BUSINESS_CODE` の単一事業。事業を絞って比較する。
3. **計上基準**: `revenue.basis` の `status_codes` / `date_field` が事業マスタの設定と一致しているか。

1〜3 が揃って**なお差が出る場合は計算の二重実装を疑う**（本来ありえない。両者は
`profit-helpers` の同一関数を呼んでいる）。その場合は数字を直す前に原因を報告すること。

### 6.2 `amount` / `amount_total` の是正について（2026-07 変更）

プライマリ KPI が「台数」系の事業では、従来 `closed_deals[].amount` と
`pipeline.by_stage[].amount_total` に **金額ではなく台数**が入っていた
（例: 2 台・取扱高 480 万の案件で `amount: 2`）。`revenue.gmv` に本物の金額が入ると
同じレスポンス内で `amount: 2` と `gmv: 4800000` が並んで必ず読み間違えるため、
`amount` 系も取扱高の基準金額フィールド（`rewardConfig.shotBaseField`）を見るように是正した。

- **この 2 フィールドの値は従来より大きくなる**（台数 → 円）。既存の消費者側で
  `amount` を台数として使っていた箇所があれば `units` に切り替えること。
- 参照先が KPI と異なる場合は `notes` にどのフィールドを見たかを明記する。
- `shotBaseField` が未設定の事業では従来どおりプライマリ KPI の `sourceField` を見る（挙動不変）。
