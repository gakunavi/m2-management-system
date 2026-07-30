# 顧客取り込み API 仕様書（外部システム連携）

購入申込フォームの顧客情報を m2 に反映するための API。
呼び出し元は m2 の外にある Python スクリプト（`push_to_m2.py`）を想定したサーバー間通信で、ブラウザからは呼ばない。

- ベースパス: `/api/integrations`
- 認証: `Authorization: Bearer <INTEGRATION_API_TOKEN>`
- 対象事業: env `INTEGRATION_BUSINESS_CODE`（既定 `LIGHT` ＝ マイグレーションライト事業 / `businessId=5`）
  リクエストに事業IDを含める必要はない
- レート制限: 60回/分/IP

## 基本方針（2026-07-30 仕様変更を反映）

| # | 方針 |
|---|---|
| 1 | 顧客の特定キーは **`mo_no`（MO番号）だけ**。専用カラムは作らず、既存の事業別カスタムフィールドを使う |
| 2 | **既定は更新のみ**。`mo_no` で見つからなければ `404`。`allow_create: true` のときだけ新規作成 |
| 3 | **食い違いは黙って上書きしない**。空欄は自動で埋め、相違は `conflicts` で返す。上書きは `overwrite_fields` 指定分のみ |
| 4 | **`dry_run: true`** は DB を一切変更せず判定結果だけ返す。**冪等キーも消費しない** |

### MO番号の格納先

専用カラムではなく、**既存の事業別カスタムフィールド**に入っている。

```
businesses.business_config.customerFields = [{ "key": "mo_no", "label": "MO番号", "type": "text" }]
customer_business_links.link_custom_data->>'mo_no'   ← 実データ（事業 = ライト事業）
```

本番実データ（2026-07-30 確認）:

| 項目 | 値 |
|---|---|
| ライト事業に紐づく顧客リンク | 75件 |
| `mo_no` が入っている | 75件（全件） |
| ユニーク | 75件（重複なし） |
| 形式 | 全件 `MO-<数字>`（例: `MO-1`, `MO-79`） |

なお m2 の `customers.customer_code` は社内採番の `CST-####` で、MO番号とは**別物**（本番173件すべて `CST-` 形式）。

---

## 目次

1. [認証と共通仕様](#1-認証と共通仕様)
2. [POST /api/integrations/customers/import](#2-post-apiintegrationscustomersimport)
3. [GET /api/integrations/customers（照合）](#3-get-apiintegrationscustomers)
4. [GET /api/integrations/customers/{id}（読み戻し検算）](#4-get-apiintegrationscustomersid)
5. [フィールド対応表](#5-フィールド対応表)
6. [検証手順](#6-検証手順)
7. [運用メモ](#7-運用メモ)

---

## 1. 認証と共通仕様

```
Authorization: Bearer <INTEGRATION_API_TOKEN>
```

| 状況 | ステータス | ボディ |
|---|---|---|
| サーバ側にトークン未設定 | `404` | `{"error":"Not found"}`（エンドポイントの存在自体を隠す） |
| トークン不一致・ヘッダ無し | `401` | `{"error":"Unauthorized"}`（理由は返さない） |
| HTTPS でない（本番のみ） | `403` | `{"error":"HTTPS required"}` |
| IP許可リスト設定時に対象外IP | `401` | `{"error":"Unauthorized"}` |
| レート制限超過 | `429` | `{"success":false,"error":{"message":"..."}}` ＋ `Retry-After` ヘッダ |

- トークン比較はタイミング安全比較（`timingSafeEqual`）
- HTTPS 判定は ALB で TLS 終端するため `x-forwarded-proto` ヘッダで行う
- IP許可リストは env `INTEGRATION_IP_ALLOWLIST`（カンマ区切り）。**未設定＝IP制限なし**

### 機微情報の扱い

- **リクエストボディはログに一切出力しない。** 口座番号・口座名義・法人番号がログに残ることはない
- サーバログに残るのは MO番号 / 顧客ID / 新規・更新の別 / dry_run の別 / 件数のみ
- Prisma の本番ログは `error` のみ（クエリ値は出力されない）

---

## 2. POST /api/integrations/customers/import

```
POST /api/integrations/customers/import
Authorization: Bearer <APIトークン>
Idempotency-Key: <呼び出し側が生成するハッシュ>   ← dry_run では不要（消費されない）
Content-Type: application/json
```

### 制御項目

| フィールド | 型 | 既定 | 説明 |
|---|---|---|---|
| `mo_no` | string | **必須** | 顧客の特定キー。これだけが必須項目 |
| `allow_create` | boolean | `false` | `mo_no` 未ヒット時に新規作成を許す |
| `dry_run` | boolean | `false` | DBを一切変更せず判定結果だけ返す |
| `overwrite_fields` | string[] | `[]` | 食い違い項目のうち上書きを許可する項目名 |

### 判定ロジック（項目単位）

| 既存値 | 送信値 | 挙動 | レスポンス |
|---|---|---|---|
| 空欄（null / 空文字） | あり | **自動で埋める** | `filled_fields` |
| 値あり（同値） | あり | 何もしない | — |
| 値あり（相違） | あり | **DBは変更しない** | `conflicts`（既存値・送信値を両方返す） |
| 値あり（相違） | あり ＋ `overwrite_fields` に列挙 | **上書きする** | `updated_fields` |
| 任意 | null / 空文字 | 何もしない（既存値を保持） | — |

`customer_type` が既定値 `未設定` の場合は「空欄」として扱う。

### 必須項目

`mo_no` 以外は原則任意（更新したい項目だけ送ればよい）。
ただし `allow_create: true` のときは、新規作成に足りる最低限を要求する。

| 条件 | 必須フィールド |
|---|---|
| 常に | `mo_no` |
| `allow_create: true` | `company_name` / `address` / `representative_name` / `customer_type` |
| `allow_create: true` かつ `customer_type` が `法人` | `corporate_no`（13桁） |

`customer_type` は `法人` / `個人事業主` / `個人`。個人事業主・個人は法人番号を持たないため `corporate_no` は `null` で通る。

### リクエスト例

```json
{
  "mo_no": "MO-79",
  "dry_run": true,
  "form_submitted_at": "2026-07-29T10:23:00+09:00",
  "customer_type": "法人",
  "company_name": "株式会社結新社",
  "postal_code": "108-0075",
  "address": "東京都港区港南2-2-14 協和ビルディング",
  "phone": "03-1234-5678",
  "representative_name": "山田 太郎",
  "established_on": "2015-04-01",
  "corporate_no": "1234567890123",
  "invoice_no": "T1234567890123",
  "fiscal_month": 3,
  "industry": "建設業",
  "company_email": "info@example.co.jp",
  "bank_name": "GMOあおぞらネット銀行",
  "branch_name": "法人第二営業部",
  "account_type": "普通",
  "account_no": "1234567",
  "account_holder": "カ）ケッシンシャ",
  "contacts": [
    { "role": "main", "name": "佐藤 花子", "department": "総務部", "email": "sato@example.co.jp" },
    { "role": "cc",   "name": "鈴木 一郎", "department": null,     "email": "suzuki@example.co.jp" }
  ],
  "gbiz_id_prime": "取得済み",
  "kyoka_zeisei_history": "なし",
  "gratitude_addressee": "株式会社結新社 御中",
  "delivery_address": "〒108-0075 東京都港区港南2-2-14 協和ビルディング"
}
```

### レスポンス

**更新（`dry_run` / 本実行）→ `200`**

```json
{
  "mo_no": "MO-79",
  "id": 501,
  "url": "https://manage.gakunavi.co.jp/customers/501",
  "created": false,
  "dry_run": true,
  "filled_fields": ["postal_code", "company_email", "invoice_no", "gratitude_addressee"],
  "updated_fields": [],
  "conflicts": [
    { "field": "phone", "existing": "03-0000-0000", "incoming": "03-1234-5678" }
  ],
  "warnings": ["industry マスタ未一致：建設業"]
}
```

**新規作成（`allow_create: true`・本実行）→ `201`**

```json
{
  "mo_no": "MO-100",
  "id": 601,
  "url": "https://manage.gakunavi.co.jp/customers/601",
  "created": true,
  "dry_run": false,
  "filled_fields": ["company_name", "address", "..."],
  "updated_fields": [],
  "conflicts": [],
  "warnings": []
}
```

**新規作成の `dry_run` → `200`（`id` と `url` は `null`）**

まだ作っていないので採番されていない。`created: true` / `dry_run: true` で「これから作る」ことを示す。

```json
{
  "mo_no": "MO-100",
  "id": null,
  "url": null,
  "created": true,
  "dry_run": true,
  "filled_fields": ["company_name", "address", "representative_name", "..."],
  "updated_fields": [],
  "conflicts": [],
  "warnings": []
}
```

- `filled_fields` / `updated_fields` / `conflicts[].field` は**リクエストJSONのフィールド名**
- 連絡先は `contacts[<メール または 氏名>]`（新規追加）、`contacts[<キー>].department` のような形（既存の項目差異）
- 口座を新規登録する場合は `bank_account`、既存口座の項目差異は `bank_name` などの個別名
- `form_submitted_at` と連絡先の role 対応は顧客データの更新ではないため、`filled_fields` / `updated_fields` には含めず常に最新を保持する

### エラー

| ステータス | 意味 | ボディ |
|---|---|---|
| `404` | `mo_no` 未ヒット（更新のみモード） | `{"error":"mo_no=MO-9999 の顧客が m2 に見つかりません。新規作成する場合は allow_create: true を指定してください。","mo_no":"MO-9999"}` |
| `422` | バリデーションエラー | `{"error":"Validation failed","errors":[{"field":"mo_no","message":"..."}]}` |
| `409` | 同一 Idempotency-Key で異なる内容 | `{"error":"Idempotency-Key conflict: ..."}` |
| `409` | 法人番号の一意制約違反（下記参照） | `{"error":"Conflict: 一意制約に違反しました（法人番号の重複の可能性があります）"}` |
| `409` | 事業リンクはあるが顧客レコードが無い（データ不整合） | `{"error":"mo_no=... の事業リンクは存在しますが、顧客レコード（id=...）が見つかりません"}` |
| `400` | JSON パース失敗 | `{"error":"Invalid JSON body"}` |
| `401` / `403` / `404` / `429` | [認証と共通仕様](#1-認証と共通仕様)を参照 | |
| `500` | サーバ側エラー | `{"error":"Internal error"}` |

### Idempotency-Key

- 同じキーで再送された場合、**DB を一切変更せず前回と同じレスポンス**を返す（ヘッダ `Idempotent-Replay: true`）
- 同じキーで**異なる内容**が来た場合は `409`
- **`dry_run: true` のリクエストは冪等キーを消費しない**（記録も参照もしない）。検証を何度でも繰り返せる
- 保持期間 30 日。期限切れは書き込み時に遅延削除（cron に依存しない）
- リクエストボディそのものは保存せず、SHA-256 ハッシュのみを保持

### curl 実行例

`~/.m2_env` を読み込んでから実行する。

```bash
source ~/.m2_env
```

**1) dry_run（DBを変更しない）**

```bash
curl -i -X POST "$M2_API_BASE_PROD/api/integrations/customers/import" \
  -H "Authorization: Bearer $M2_API_TOKEN_PROD" \
  -H "Content-Type: application/json" \
  -d '{
    "mo_no": "MO-79",
    "dry_run": true,
    "customer_type": "法人",
    "company_name": "株式会社結新社",
    "postal_code": "108-0075",
    "address": "東京都港区港南2-2-14 協和ビルディング",
    "phone": "03-1234-5678",
    "representative_name": "山田 太郎",
    "corporate_no": "1234567890123"
  }'
```

**2) 本実行（空欄だけ埋まる）**

```bash
curl -i -X POST "$M2_API_BASE_PROD/api/integrations/customers/import" \
  -H "Authorization: Bearer $M2_API_TOKEN_PROD" \
  -H "Idempotency-Key: 79-20260729-1" \
  -H "Content-Type: application/json" \
  -d '{ "mo_no": "MO-79", "postal_code": "108-0075", "company_email": "info@example.co.jp" }'
```

**3) 食い違いを上書き（overwrite_fields 指定）**

```bash
curl -i -X POST "$M2_API_BASE_PROD/api/integrations/customers/import" \
  -H "Authorization: Bearer $M2_API_TOKEN_PROD" \
  -H "Idempotency-Key: 79-20260729-2" \
  -H "Content-Type: application/json" \
  -d '{ "mo_no": "MO-79", "phone": "03-1234-5678", "overwrite_fields": ["phone"] }'
```

**4) 新規作成**

```bash
curl -i -X POST "$M2_API_BASE_PROD/api/integrations/customers/import" \
  -H "Authorization: Bearer $M2_API_TOKEN_PROD" \
  -H "Idempotency-Key: 100-20260729-1" \
  -H "Content-Type: application/json" \
  -d '{
    "mo_no": "MO-100",
    "allow_create": true,
    "customer_type": "個人事業主",
    "company_name": "山田工務店",
    "address": "静岡県静岡市駿河区1-1",
    "representative_name": "山田 次郎",
    "corporate_no": null,
    "contacts": []
  }'
```

---

## 3. GET /api/integrations/customers

取り込み前の照合用。

```
GET /api/integrations/customers?mo_no=MO-79
GET /api/integrations/customers?corporate_no=1234567890123
GET /api/integrations/customers?company_email=info@example.co.jp
```

複数指定した場合は `mo_no` → `corporate_no` → `company_email` の優先順位で1つだけを使う。いずれも未指定なら `422`。

### レスポンス（`200`）

```json
{
  "matched_by": "mo_no",
  "matches": [
    {
      "id": 501,
      "mo_no": "MO-79",
      "company_name": "株式会社結新社",
      "customer_code": "CST-0079",
      "corporate_no": "1234567890123",
      "company_email": "info@example.co.jp",
      "is_active": true,
      "url": "https://manage.gakunavi.co.jp/customers/501"
    }
  ]
}
```

一致が無ければ `matches` は空配列（`404` にはしない）。最大 20 件。
`customer_code` は m2 の社内採番コードで、MO番号とは別物。

```bash
curl -s "$M2_API_BASE_PROD/api/integrations/customers?mo_no=MO-79" \
  -H "Authorization: Bearer $M2_API_TOKEN_PROD"
```

---

## 4. GET /api/integrations/customers/{id}

読み戻し検算用。**取り込み時に送った JSON と同じフィールド名**で現在値を返す。

```json
{
  "id": 501,
  "url": "https://manage.gakunavi.co.jp/customers/501",
  "mo_no": "MO-79",
  "customer_code": "CST-0079",
  "customer_type": "法人",
  "company_name": "株式会社結新社",
  "postal_code": "108-0075",
  "address": "東京都港区港南2-2-14 協和ビルディング",
  "phone": "03-1234-5678",
  "representative_name": "山田 太郎",
  "established_on": "2015-04-01",
  "corporate_no": "1234567890123",
  "invoice_no": "T1234567890123",
  "fiscal_month": 3,
  "industry": "建設業",
  "industry_raw": "建設業",
  "company_email": "info@example.co.jp",
  "bank_name": "GMOあおぞらネット銀行",
  "branch_name": "法人第二営業部",
  "account_type": "普通",
  "account_no": "1234567",
  "account_holder": "カ）ケッシンシャ",
  "contacts": [
    { "id": 101, "role": "main", "name": "佐藤 花子", "department": "総務部", "email": "sato@example.co.jp" }
  ],
  "gbiz_id_prime": "取得済み",
  "kyoka_zeisei_history": "なし",
  "gratitude_addressee": "株式会社結新社 御中",
  "delivery_address": "〒108-0075 東京都港区港南2-2-14 協和ビルディング",
  "form_submitted_at": "2026-07-29T10:23:00+09:00",
  "is_active": true,
  "version": 4,
  "updated_at": "2026-07-29T01:23:45.678Z"
}
```

- `contacts` に代表者は含まれない（代表者は `representative_name` として返す）
- 存在しないIDは `404`
- **口座番号・口座名義を含むレスポンスなので、呼び出し側でもログに残さないこと**

```bash
curl -s "$M2_API_BASE_PROD/api/integrations/customers/501" \
  -H "Authorization: Bearer $M2_API_TOKEN_PROD"
```

---

## 5. フィールド対応表

| リクエストJSON | m2 の格納先 | 備考 |
|---|---|---|
| `mo_no` | `customer_business_links.link_custom_data->>'mo_no'` | **特定キー**。既存カスタムフィールド。専用カラムは作っていない |
| `customer_type` | `customers.customer_type` | 法人 / 個人事業主 / 個人。既定値 `未設定` は空欄扱い |
| `company_name` | `customers.customer_name` | |
| `postal_code` | `customers.customer_postal_code` | |
| `address` | `customers.customer_address` | |
| `phone` | `customers.customer_phone` | |
| `company_email` | `customers.customer_email` | |
| `corporate_no` | `customers.customer_corporate_number` | 13桁。UNIQUE制約あり |
| `invoice_no` | `customers.customer_invoice_number` | `T` + 13桁 |
| `established_on` | `customers.customer_established_date` | `YYYY-MM-DD` |
| `fiscal_month` | `customers.customer_fiscal_month` | 1〜12 |
| `industry` | `industries` マスタへの紐付け | 一致すれば紐付け、無ければ `null` + 警告。**マスタは自動作成しない** |
| `representative_name` | `customer_contacts`（代表者フラグ付き） | Customer 本体に代表者名カラムは無い |
| `contacts[]` | `customer_contacts` | `role:main` → 主担当フラグ / `role:cc` → 通常の連絡先。突合はメール優先、無ければ氏名 |
| `bank_*` / `account_*` | `customer_bank_accounts` | 対象事業に紐付けて1件を管理。**新規登録時は5項目すべて必須** |
| `industry_raw` | `link_custom_data` | 送信された業種の原文字列（マスタ未一致でも追跡できるように） |
| `gratitude_addressee` | `link_custom_data` | 感謝状の宛名。**`customer_salutation` には入れない** |
| `gbiz_id_prime` | `link_custom_data` | |
| `kyoka_zeisei_history` | `link_custom_data` | |
| `delivery_address` | `link_custom_data` | |
| `form_submitted_at` | `link_custom_data` | |
| （自動付与） | `link_custom_data.contact_roles` | `{"<連絡先ID>":"main"\|"cc"}`。後段のメール送信で To/CC を分けるため |
| （自動付与） | `link_custom_data.representative_contact_id` | 代表者の連絡先ID |

### 補足

- `customer_salutation`（顧客宛名）は取り込み対象外。正規の宛名が別途届くまで `null` のまま
- 新規作成時の `customers.customer_code` は社内採番（`CST-####`）を自動付与
- 取り込みAPIはセッションユーザーを持たないため `created_by` / `updated_by` は `null`。更新時は既存の `updated_by` を書き換えない（人が最後に触った記録を残す）
- スキーマに無いフィールドがJSONに含まれていても無視する（前方互換）

---

## 6. 検証手順

`dry_run` があるので本番に対して安全に実施できる。

| # | 内容 | 期待 |
|---|---|---|
| 1 | 実在しない `mo_no` で `dry_run` | `404` |
| 2 | 既存顧客で `dry_run` | DB無変更・`filled_fields` と `conflicts` が返る |
| 3 | 同じ内容で本実行 | 空欄だけ埋まる。`conflicts` は据え置き |
| 4 | 食い違うデータで `dry_run` → `overwrite_fields` 指定で本実行 | 指定した項目だけ上書き |
| 5 | 同じ Idempotency-Key で再送 | DB無変更・前回と同じレスポンス |
| 6 | `GET /{id}` で読み戻し | 送信値と一致 |

上記1〜6は単体テストでも同じ判定を検証している（`tests/api/customer-import.test.ts` / 27件）。

### 検証用テスト顧客について

本番に検証用のテスト顧客は**存在しない**（2026-07-30 確認。顧客173件はすべて実データで、`MO-00` に相当するものは無い）。
検証には m2 の管理画面から1件作成する必要がある。**API 側から本番DBへテストデータを投入することはしない。**

---

## 7. 運用メモ

### 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `INTEGRATION_API_TOKEN` | ★ | Bearer トークン。未設定ならエンドポイントは 404 |
| `INTEGRATION_BUSINESS_CODE` | ☆ | 取り込み対象事業の businessCode。既定 `LIGHT` |
| `INTEGRATION_IP_ALLOWLIST` | ☆ | 許可するIPのカンマ区切り。未設定＝IP制限なし |
| `NEXTAUTH_URL` | ★ | レスポンスの `url` 生成に使用（既存の必須変数） |

本番では `INTEGRATION_API_TOKEN` を AWS Secrets Manager（`m2/integration-api-token`）から注入する。
`.aws/task-definition.json` に登録済み。

### DBスキーマ変更（追加のみ）

`20260729130000_add_customer_import_integration`:

- `integration_idempotency_keys` テーブル新設のみ

`20260730090000_add_customer_corporate_number_unique`:

- `customers.customer_corporate_number` に UNIQUE インデックス

既存カラムの削除・リネーム・型変更は無し。既存行のバックフィルも不要。
**MO番号のための専用カラムは追加していない**（既存カスタムフィールドを使うため）。

### 法人番号の UNIQUE インデックス

適用前に本番DBの重複を確認済み（2026-07-30・ECS run-task による読み取り専用クエリ）:

| 項目 | 件数 |
|---|---|
| 顧客総数 | 173 |
| 法人番号あり | 8 |
| 重複 | **0** |
| 空文字 | 0 |

PostgreSQL の UNIQUE 索引は NULL 同士を重複と見なさないため、法人番号を持たない顧客は何件でも `NULL` で共存できる。
空文字は全書き込み経路（顧客POST / 顧客PATCH / CSV取込 / 取り込みAPI）が `|| null` で正規化しているため衝突しない。

**同一法人番号での新規作成は 409 で止める（2026-07-30 確定）。**
ライト事業は「1社＝1MO番号」で、追加購入も同じMO番号のまま台数を増やす運用。
したがって同一法人番号で別MO番号の新規作成が起きたら、それは登録ミスである。
UNIQUE インデックスは維持し、`409` を返して止める。呼び出し側で既存レコードのMO番号を確認し、名寄せする。
