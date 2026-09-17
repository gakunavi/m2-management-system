# 契約読み出し API 仕様書（外部システム連携）

契約マスタ（案件）を Google スプレッドシートへ転記するための **read-only** API。
呼び出し元は m2 の外にある Python スクリプトを想定したサーバー間通信で、ブラウザからは呼ばない。
毎週日曜に「営業ステータス＝購入済み」の案件を全件取得し、事務がマシンマスタ等へ転記する運用。

- 実装: `src/app/api/integrations/contracts/route.ts`（整形・検証は `src/lib/contract-read.ts`）
- 認証: `Authorization: Bearer <INTEGRATION_READONLY_TOKEN>`（**書き込み用の `INTEGRATION_API_TOKEN` では通らない**）
- 対象事業: env `INTEGRATION_BUSINESS_CODE`（既定 `LIGHT` ＝ ライト事業 / `businessId=5`）
- レート制限: 60回/分/IP（`/api/integrations/**` 共通・ECSタスクごとの計数）
- **読み取り専用。このエンドポイントから DB 書き込み・スキーマ変更は一切行わない。GET 以外のメソッドは無い。**

---

## 1. エンドポイント

```
GET /api/integrations/contracts?status=purchased&limit=100
```

### クエリパラメータ

| パラメータ | 必須 | 既定 | 内容 |
|---|---|---|---|
| `status` | 任意 | 全件 | 営業ステータス**コード**で絞る（例 `purchased`）。**ラベル（`1_購入済み`）を渡すと `422`** |
| `updated_since` | 任意 | なし | ISO 8601。`project_status_changed_at` がこの日時**以降**のものだけ |
| `mo_no` | 任意 | なし | 単一MO番号での絞り込み |
| `limit` | 任意 | 100 | 1〜500 の整数。範囲外は `422` |
| `cursor` | 任意 | なし | 前回レスポンスの `next_cursor` をそのまま渡す |

### 営業ステータスコード（ライト事業・2026-09-18 時点）

| コード | ラベル |
|---|---|
| `purchased` | 1_購入済み |
| `applying` | 2_申請中 |
| `informal_approval` | 3_内諾 |
| `prospect_a` | 4_Aヨミ |
| `prospect_b` | 5_Bヨミ |
| `in_appointment` | 6_アポ中 |
| `lost` | 7_失注 |
| `abandoned` | 8_断念 |
| `on_hold` | 9_保留 |

コードは画面から変更できない（ステータス定義の更新APIが `statusCode` を弾く）ため、キーとして安定している。
ラベルは表示用で変更されうるので**キーに使わない**。値は `business_status_definitions` にのみ存在する。

### ステータス

| 状況 | ステータス | ボディ |
|---|---|---|
| 成功 | `200` | 下記レスポンス |
| `INTEGRATION_READONLY_TOKEN` 未設定 | `404` | `{"error":"Not found"}`（エンドポイント自体を隠す） |
| トークン不一致・未指定・**書き込み用トークン** | `401` | `{"error":"Unauthorized"}` |
| 本番で HTTPS 以外 | `403` | `{"error":"HTTPS required"}` |
| パラメータ不正 | `422` | `{"error":"Validation failed","errors":[{"field","message"}]}` |
| レート制限超過 | `429` | — |
| サーバエラー | `500` | `{"error":"Internal error"}` |

---

## 2. レスポンス

```jsonc
{
  "meta": {
    "count": 14,                        // このページの件数
    "excluded_inactive_projects": 0,    // 論理削除された案件で除外した件数
    "excluded_inactive_customers": 1    // 無効化された顧客の案件で除外した件数
  },
  "items": [ /* 1件 = 1案件（契約） */ ],
  "next_cursor": null                   // 次ページがあれば不透明な文字列
}
```

- **1件 = 1案件（契約）**。1顧客が複数の案件を持てるため、`mo_no` は複数の item に出うる。
  スプレッドシート側は **`project_no` をキーに追記／更新**すること。
- 値が無い項目は `null`。**キー自体は落とさない**（呼び出し側が列を固定で埋めるため）。
- **値の正規化・整形はしない。** ニーズは `A_節税` のまま、決算月は `3`（整数）のまま返す。
- 金額は**税抜**。`purchase_amount` は数式フィールド（購入単価 × 台数）なので、保存値ではなく
  画面と同じ計算結果を返す。

### item のフィールド

| キー | 取得元 | 備考 |
|---|---|---|
| `project_no` | `projects.project_no` | スプレッドシートの更新キー |
| `project_url` | 管理画面の案件詳細URL | |
| `mo_no` | `customer_business_links.link_custom_data->>'mo_no'` | |
| `customer_id` / `customer_code` / `customer_url` | `customers.id` / `.customer_code` | |
| `status_code` | `projects.project_sales_status` | 例 `purchased` |
| `status` | `business_status_definitions.status_label` | 例 `1_購入済み` |
| `status_changed_at` | `projects.project_status_changed_at` | ISO 8601。**最後にステータスが変わった日時** |
| `company_name` | `customers.customer_name` | |
| `customer_salutation` | `customers.customer_salutation` | 画面ラベル「呼称」 |
| `customer_type` | `customers.customer_type` | `法人` / `個人事業主` / `個人` / `未設定` |
| `purchase_count` | `project_custom_data.purchase_count` | 購入回数 |
| `fiscal_month` | `customers.customer_fiscal_month` | **整数**（`3`）。「月」は付けない |
| `assigned_user_name` | `projects.project_assigned_user_name` | 営業担当（自由記入。`users` への参照は本番で未使用） |
| `needs` | `project_custom_data.needs` | ニーズ。`A_節税` 等の**生の値** |
| `unit_count` | `project_custom_data.unit_count` | 台数 |
| `unit_price` | `project_custom_data.purchase_unit_price` | 購入単価（検算用） |
| `purchase_amount` | `project_custom_data.purchase_amount` | 購入金額（税抜・数式を再計算） |
| `sales_contract_date` | `project_custom_data.sales_contract_date` | 売買契約日 |
| `operation_contract_date` | `project_custom_data.operation_contract_date` | 運用契約日 |
| `payment_received_date` | `project_custom_data.payment_received_date` | 着金日 |
| `project_notes` | `projects.project_notes` | 備考 |
| `representative_name` / `_phone` / `_email` | `customer_contacts`（`contact_is_representative=true`） | 1名 |
| `contact_name` / `_phone` / `_email` | `customer_contacts`（代表者以外の主担当→無ければ並び順先頭） | 1名。CCは返さない |
| `postal_code` / `address` | `customers.customer_postal_code` / `.customer_address` | 郵便番号は住所に含めない |
| `corporate_no` / `invoice_no` | `customers.customer_corporate_number` / `.customer_invoice_number` | **平文** |
| `company_phone` | `customers.customer_phone` | |
| `thank_you_recipient` | `project_custom_data.thank_you_recipient` | 感謝状送付先＝工業会証明書の送り先（運用上同じものとして扱う） |
| `gratitude_certificate_name` | `project_custom_data.gratitude_certificate_name` | 感謝状名義 |
| `bank_name` / `bank_branch` / `account_type` / `account_no` / `account_holder` | `customer_bank_accounts` | **平文** |
| `bank_account_scope` | — | `business`（対象事業の口座）/ `common`（事業共通）/ `null`（口座なし） |

### 口座の選び方

顧客は口座を複数持てる（`customer_bank_accounts.business_id` は NULL 可）。次の順で**1件だけ**返す。

1. 対象事業に紐付いた口座（`business_id` = ライト事業）→ `bank_account_scope: "business"`
2. 無ければ事業共通の口座（`business_id IS NULL`）→ `bank_account_scope: "common"`
3. 同じスコープに複数あれば最も古いもの（`id` 昇順）
4. どちらも無ければ口座系は全て `null`、`bank_account_scope: null`

本番では購入済み14社のうち11社が**事業共通の口座のみ**を持っているため、2 を見ないと大半が `null` になる。

### 除外されるもの

| 条件 | 扱い |
|---|---|
| 論理削除された案件（`project_is_active=false`） | 除外し、`meta.excluded_inactive_projects` に件数 |
| 無効化された顧客の案件（`customer_is_active=false`） | 除外し、`meta.excluded_inactive_customers` に件数 |

黙って消えると呼び出し側で気づけないため、必ず件数を返す。

---

## 3. ページング

`status_changed_at` 昇順 → `id` 昇順の**キーセットページング**。`next_cursor` が `null` になるまで辿る。

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://manage.gakunavi.co.jp/api/integrations/contracts?status=purchased&limit=100"
# → next_cursor があれば
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://manage.gakunavi.co.jp/api/integrations/contracts?status=purchased&limit=100&cursor=<next_cursor>"
```

- `cursor` の中身は**約束しない**（base64url の内部表現。将来変わりうる）。返ってきた値をそのまま渡すこと。
- オフセット方式ではないため、取得中に新しい案件が増えても重複・欠落が起きない。
- `project_status_changed_at` が NULL の案件は昇順で最後に来る（本番のライト事業では全件に値が入っている）。

---

## 4. `updated_since` の注意

`project_status_changed_at`（**最後にステータスが変わった日時**）で絞る。ステータス履歴のテーブルは無い。

- 購入済みになった**後**に着金日・口座・住所が埋まっても、この日時は動かない。
  → 差分取得では拾えないため、**毎週全件取得**する運用を推奨（購入済みは現在14件）。
- `projects` / `customers` / `customer_bank_accounts` には `updated_at` があるが、
  それぞれの行が書き換わったときだけ動く（顧客を直しても案件の `updated_at` は動かない）ため、
  このAPIの絞り込みには使っていない。

---

## 5. トークン

| 用途 | 環境変数 | Secrets Manager |
|---|---|---|
| 書き込み（顧客取り込み） | `INTEGRATION_API_TOKEN` | `m2/integration-api-token` |
| **読み出し（この API）** | `INTEGRATION_READONLY_TOKEN` | `m2/integration-readonly-token` |

- **相互に通らない。** 読み出しトークンで `/api/integrations/customers` を叩いても `401`、
  書き込みトークンで `/api/integrations/contracts` を叩いても `401`。
- 読み出しAPIは全顧客の口座を一括で返せるため、書き込み用トークンが漏れたときの被害範囲を広げないよう分離した。
- IP許可リスト（`INTEGRATION_IP_ALLOWLIST`）は**設定していない**（呼び出し元がノートPCでIPが変わるため）。
- ローテーション: `aws secretsmanager put-secret-value --secret-id m2/integration-readonly-token --secret-string "$(openssl rand -hex 32)"` → ECS 再デプロイ → 呼び出し側の値を差し替え。

---

## 6. 取り扱い注意

- `account_no`（口座番号）・`corporate_no`（法人番号）は**平文**で返す。事務が振込に使うため、マスクしない。
- **サーバ側はレスポンス内容をログに出さない。** 呼び出し側でもログやエラー通知に残さないこと。
- 顧客名・代表者名・住所を含むので、スプレッドシートの共有範囲に注意すること。

---

## 7. 動作確認

```bash
# トークンは Secrets Manager から取得（履歴に値を残さない）
TOKEN=$(aws secretsmanager get-secret-value --secret-id m2/integration-readonly-token \
  --region ap-northeast-1 --query SecretString --output text)

# 購入済みを全件
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://manage.gakunavi.co.jp/api/integrations/contracts?status=purchased" | python3 -m json.tool

# ラベルを渡すと 422
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://manage.gakunavi.co.jp/api/integrations/contracts?status=%31_購入済み" | python3 -m json.tool

# 認証が効いていること（401）
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://manage.gakunavi.co.jp/api/integrations/contracts"
```

自動テストは `tests/api/integration-contracts.test.ts`（29件）。
ステータス絞り込み・ページングの重複欠落・トークン分離・キー欠落・読み取り専用性を固定している。
