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
```

| パラメータ | 必須 | 既定 | 範囲 | 説明 |
|-----------|------|------|------|------|
| `months`  | 任意 | 6    | 1〜24（範囲外は自動クランプ） | 集計対象期間（当月を含む過去 N ヶ月） |

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
| `by_agent[].active_deals` / `.stages` | partner × status で集計 | |
| `closed_deals[]` | 成約ステータス案件のうち計上月が期間内のもの（1 案件 = 1 エントリ） | |
| `closed_deals[].closed_month` | `getRevenueMonth()`（KPI `dateField`、無ければ `project_expected_close_month`） | |
| `closed_deals[].agent` | partner_name / 直販 | |
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

### 成約 / 失注ステータスの判定

`businessConfig` に明示の成約コードが無い場合のフォールバック:

- **成約** = `business_status_definitions.status_is_final = true` かつ `status_is_lost = false`
- **失注** = `status_is_lost = true`

### 取得できない / 代替した項目（`notes` に明記される）

1. **`lead_time`**: 専用の成約日カラムが無いため算出しない（`null`）。
2. **`amount`**: 固定カラム無し。`businessConfig` の KPI（`sourceField`）から解決。未設定なら `null`。
3. **`units`**: 任意カスタム項目 `unit_count`。欠損時 `null`。
4. **`close_rate`**: 仕様に定義が無いため「成約数 /（成約数＋失注数）」を採用。

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
