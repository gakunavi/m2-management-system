# ML管理システム双方向連携 API 仕様書

ML管理システム（`ml-management-system`）と営業管理システム（m2）の間で、**ライト事業**の
案件・顧客・顧客担当者を双方向に編集できるようにするための API。

> 2026-11-05 石井さん：「営業管理システムへは編集のタイミングで修正で上書きして欲しい。逆も然り」

- 対象: env `INTEGRATION_BUSINESS_CODE`（既定 `LIGHT` ＝ ライト事業 / `businessId=5`）に
  紐づく案件・その顧客・顧客の担当者だけ。それ以外はすべて `404`
- 既存の `/api/integrations/contracts`・`/api/integrations/customers`・
  `/api/integrations/customers/import` の挙動は**変えていない**
- レート制限: 60回/分/IP（`/api/integrations/**` 共通・ECSタスクごとの計数）
- ⚠️ **本番未適用。** Prisma マイグレーション
  `20261105100000_add_ml_bidirectional_sync` は本番DBに当てていない（石井さんの承認後に別途）

---

## 0. 認証と共通ヘッダー

| 用途 | ヘッダー | env |
|---|---|---|
| 読み取り（GET） | `Authorization: Bearer <読み取り用トークン>` | `INTEGRATION_READONLY_TOKEN` |
| 書き込み（POST/PATCH/DELETE） | `Authorization: Bearer <書き込み用トークン>` | `INTEGRATION_API_TOKEN` |

**トークンは用途ごとに分かれている。** 読み取り用トークンで書き込み口を叩くと `401`、
書き込み用トークンで読み取り口を叩くと `401`（既存の契約読み出しAPIと同じ方針）。

### 書き込みに必須のヘッダー

| ヘッダー | 必須 | 内容 |
|---|:-:|---|
| `X-ML-User` | ○ | ML の利用者名。**UTF-8 のパーセントエンコード**。変更履歴に `ML：<名前>` として残る。無ければ `422` |
| `Idempotency-Key` | 任意 | 同じキー＋同じ内容の再送は DB を変更せず前回のレスポンスを返す（`Idempotent-Replay: true`）。保持30日 |

`X-ML-User` をパーセントエンコードするのは、HTTP ヘッダーの値が Latin-1 しか運べないため
（日本語をそのまま入れると送信時に落ちるか文字化けする）。ASCII だけの名前はそのままでも通る。

```
X-ML-User: %E5%B1%B1%E7%94%B0%E5%A4%AA%E9%83%8E   # encodeURIComponent('山田太郎')
```

### 共通のエラー

| ステータス | 意味 | 本文 |
|---|---|---|
| `400` | JSON が壊れている | `{"error":"Invalid JSON body"}` |
| `401` | トークン違い・未指定 | `{"error":"Unauthorized"}`（理由は返さない） |
| `404` | ライト事業の対象ではない／存在しない／論理削除済み | `{"error":"Not found"}` |
| `409` | 先に更新されていた／`Idempotency-Key` の使い回し | 下記 |
| `422` | バリデーション違反 | `{"error":"Validation failed","errors":[{"field":"...","message":"..."}]}` |
| `429` | レート制限 | `Retry-After` 付き |
| `500` | 想定外 | `{"error":"Internal error"}` |

`404` は「事業外」「存在しない」「無効化済み」を区別しない。区別して返すと、
ライト事業以外の顧客の存在が分かってしまう。

**`409` の本文には現在値が入る。** ML 側はこれでセルの表示を最新に直し、利用者に再編集させる。

```json
{
  "error": "Conflict",
  "message": "他のユーザーが変更しました。最新データを取得してください。",
  "current": { "project_no": "LIGHT-0077", "status_code": "purchased", "version": 7 }
}
```

### 楽観ロック

| 対象 | 送るもの | どこから取る |
|---|---|---|
| 案件 | `version`（整数） | `GET /api/integrations/projects/{project_no}` |
| 顧客 | `version`（整数） | `GET /api/integrations/customers/{customer_code}/contacts` の `customer.version` |
| 担当者 | `updated_at`（ISO 8601） | 同 GET の `items[].updated_at`（`CustomerContact` に `version` カラムが無いため） |

既存の契約読み出しAPI（`GET /api/integrations/contracts`）は `version` を返さない（挙動を
変えないため足していない）。編集画面を開く直前に上の GET を読むこと。

---

## 1. 担当者を読む（新規・読み取り）

```
GET /api/integrations/customers/{customer_code}/contacts
```

認証: **読み取り用トークン**。ML のマシン契約マスタ詳細画面がサーバー側から毎回読む想定
（ML は担当者を保存しない。営業管理システムが正）。

### レスポンス

```json
{
  "customer": {
    "customer_code": "CST-0001",
    "customer_url": "https://manage.example.test/customers/11",
    "version": 2
  },
  "meta": { "count": 2 },
  "items": [
    {
      "id": 31,
      "contact_name": "鈴木花子",
      "department": "総務部",
      "position": "課長",
      "is_representative": false,
      "is_primary": true,
      "phone": "03-1234-5678",
      "fax": "03-1234-5679",
      "email": "suzuki@example.com",
      "has_business_card_front": true,
      "has_business_card_back": false,
      "businesses": [{ "business_code": "LIGHT", "business_name": "ライト事業" }],
      "version": null,
      "updated_at": "2026-11-05T02:00:00.000Z"
    }
  ]
}
```

- 並びは `contactSortOrder` → `id`
- 未入力は `null`。**キーは絶対に落とさない**（ML が列を固定で埋めるため）
- `version` は常に `null`（担当者に version カラムが無い）。楽観ロックは `updated_at` を使う
- **名刺は有無だけ。** 画像の URL は返さない（渡すと ML から直接取得できてしまう）
- **返さないもの**: 口座情報・法人番号・インボイス番号・住所・名刺画像のURL
- ⚠️ **レスポンス本文はログに出さない**（担当者の電話・メールを含む）

キー集合は `src/lib/integration-contacts-read.ts` の `CONTACT_ITEM_KEYS` が正。
返してはいけないキーは `CONTACT_FORBIDDEN_KEYS` に並べてあり、
`tests/api/ml-sync.test.ts` がドリフトを検知する。

### curl

```bash
curl -s "https://manage.example.test/api/integrations/customers/CST-0001/contacts" \
  -H "Authorization: Bearer READONLY_TOKEN_DUMMY"
```

---

## 2. 案件を読む（新規・読み取り）

```
GET /api/integrations/projects/{project_no}
```

認証: **読み取り用トークン**。`PATCH` の前に `version` を取るための口。

```json
{
  "project_no": "LIGHT-0077",
  "project_url": "https://manage.example.test/projects/123",
  "customer_code": "CST-0001",
  "status_code": "informal_approval",
  "status_label": "3_内諾",
  "status_changed_at": "2026-11-05T01:00:00.000Z",
  "needs": "A_節税",
  "unit_count": 5,
  "unit_price": 2400000,
  "purchase_amount": 12000000,
  "sales_contract_date": "2026-09-10",
  "operation_contract_date": "2026-09-12",
  "payment_received_date": "2026-09-14",
  "sme_agency_applicant": "株式会社テスト",
  "version": 4
}
```

```bash
curl -s "https://manage.example.test/api/integrations/projects/LIGHT-0077" \
  -H "Authorization: Bearer READONLY_TOKEN_DUMMY"
```

---

## 3. 案件を書き戻す（新規・書き込み）

```
PATCH /api/integrations/projects/{project_no}
```

認証: **書き込み用トークン**。レスポンスは上の GET と同じ形（更新後の値＋新しい `version`）。

### 受け付ける項目

送った項目だけが更新される（部分更新）。`null` は「空にする」。

| キー | 型 | m2 の保存先 |
|---|---|---|
| `status_code` | 営業ステータスの**コード** | `projects.project_sales_status` |
| `needs` | 文字列 / null | `project_custom_data.needs` |
| `unit_count` | 0以上の整数 / null | `project_custom_data.unit_count` |
| `unit_price` | 0以上の整数 / null | `project_custom_data.purchase_unit_price` |
| `sales_contract_date` | `YYYY-MM-DD` / null | `project_custom_data.sales_contract_date` |
| `operation_contract_date` | `YYYY-MM-DD` / null | `project_custom_data.operation_contract_date` |
| `payment_received_date` | `YYYY-MM-DD` / null | `project_custom_data.payment_received_date` |
| `sme_agency_applicant` | 文字列 / null | `project_custom_data.sme_agency_applicant` |
| `version` | 整数（**必須**） | 楽観ロック |

**知らないキーは `422`。** ML 側のタイプミスを黙って捨てない（`.strict()`）。

### 受け付けない項目とその理由

| キー | 理由 |
|---|---|
| `purchase_amount` | ライト事業では「購入単価 × 台数」の**計算項目**。送っても m2 が再計算して上書きするため、黙って消えるより `422` で理由を返す。金額を直すには `unit_price` か `unit_count` を直す |
| `plan` | ML 側が `needs`（`A_節税` → `A`）から導く値。m2 に項目が無い |
| `mo_no` | 顧客の事業別カスタム項目。顧客取り込みAPI（`/customers/import`）が正 |
| `company_name` / `customer_type` | 顧客の項目 → 顧客PATCH（§4） |
| `status_label` / `status_changed_at` | 表示用・m2 が自分で打つ値 |
| 口座・法人番号・インボイス番号・住所・連絡先 | ML は保存しない（ML設計書 4-2「持たないもの」） |
| `project_notes` / `thank_you_recipient` / `gratitude_certificate_name` | 読み出しAPIは返すが ML の表に無い。写しを持っていない項目は直せない |

この集合は ML リポジトリの `docs/phase1-spec.md` 4-2（`ml.m2_projects` /
`ml.m2_project_details`）の列と、既存の契約読み出しAPI が返す項目を突き合わせて決めた。
定義は `src/lib/ml-project-fields.ts`。

### 画面と同じ更新処理を通る

この PATCH は画面の `PATCH /api/v1/projects/[id]` と**同じ関数**
（`src/lib/project-update.ts` の `applyProjectUpdate`）を呼ぶ。そのため ML 経由でも以下が
同じように起きる。

- 営業ステータスの存在確認（無効なコードは `422`）
- `project_status_changed_at` の打ち直し
- **収益確定のラッチ**: 収益確定フラグ付きステータス（ライト事業は `purchased`）へ変わった
  瞬間に `revenue_confirmed_at` をセット
- **手数料の凍結**: 同じ瞬間に実効料率を `reward_snapshot` へ焼き付ける
- 社内主担当者への通知（`status_change`）
- `project_custom_data` のマージ更新（送っていない項目は消えない）＋ 計算項目の再計算
- 楽観ロック（`version: { increment: 1 }`）

`updated_by` には**入らない**（ML の利用者は m2 のユーザーではないため FK に載せられない）。
代わりに `integration_change_logs` へ `ML：<名前>` と変わった項目名が残る（値は残さない）。

### curl

```bash
# 1. version を取る
curl -s "https://manage.example.test/api/integrations/projects/LIGHT-0077" \
  -H "Authorization: Bearer READONLY_TOKEN_DUMMY"

# 2. 書き戻す
curl -s -X PATCH "https://manage.example.test/api/integrations/projects/LIGHT-0077" \
  -H "Authorization: Bearer WRITE_TOKEN_DUMMY" \
  -H "X-ML-User: %E5%B1%B1%E7%94%B0%E5%A4%AA%E9%83%8E" \
  -H "Idempotency-Key: ml-20261105-0001" \
  -H "Content-Type: application/json" \
  -d '{
        "version": 4,
        "status_code": "purchased",
        "unit_count": 8,
        "unit_price": 2400000,
        "payment_received_date": "2026-11-04"
      }'
```

---

## 4. 顧客を書き戻す（新規・書き込み）

```
PATCH /api/integrations/customers/{customer_code}
```

認証: **書き込み用トークン**。

> ⚠️ 同じパスの `GET /api/integrations/customers/{id}`（既存・取り込みの読み戻し検算用）は
> **数値ID**を取る。PATCH は**顧客コード**（`CST-0001`）。Next.js は同じ階層で別名の動的
> セグメントを持てないため、同じ `[id]` を共有している。既存 GET の挙動は変えていない。

### 受け付ける項目

| キー | 型 | m2 の保存先 |
|---|---|---|
| `company_name` | 1〜200文字 | `customers.customer_name` |
| `customer_type` | `法人` / `個人事業主` / `個人` / `確認中` / `未設定` | `customers.customer_type` |
| `version` | 整数（**必須**） | 楽観ロック |

ML が顧客について持っているのは `ml.m2_project_details` の `company_name` と
`customer_type` だけ（住所・法人番号・インボイス番号・連絡先は取り込み時に捨てている）。
写しを持っていない項目は ML の画面に出ていないので、直す口も開けない。知らないキーは `422`。

画面の `PATCH /api/v1/customers/[id]` と同じ関数（`src/lib/customer-update.ts` の
`applyCustomerUpdate`）を通るので、**社名＋電話番号の完全一致の重複チェック**もそのまま
効く（当たると `409`）。

### レスポンス

```json
{
  "customer_code": "CST-0001",
  "customer_url": "https://manage.example.test/customers/11",
  "company_name": "テスト商事",
  "customer_type": "法人",
  "version": 3
}
```

### curl

```bash
curl -s -X PATCH "https://manage.example.test/api/integrations/customers/CST-0001" \
  -H "Authorization: Bearer WRITE_TOKEN_DUMMY" \
  -H "X-ML-User: %E5%B1%B1%E7%94%B0%E5%A4%AA%E9%83%8E" \
  -H "Idempotency-Key: ml-20261105-0002" \
  -H "Content-Type: application/json" \
  -d '{ "version": 2, "company_name": "テスト商事", "customer_type": "法人" }'
```

---

## 5. 担当者を追加・更新・削除（新規・書き込み）

```
POST   /api/integrations/customers/{customer_code}/contacts
PATCH  /api/integrations/customers/{customer_code}/contacts/{id}
DELETE /api/integrations/customers/{customer_code}/contacts/{id}
```

認証: **書き込み用トークン**。項目名は画面の API と同じ camelCase。

| キー | 型 | 備考 |
|---|---|---|
| `contactName` | 1〜100文字 | POST では必須 |
| `contactDepartment` | 100文字以内 / null | |
| `contactPosition` | 100文字以内 / null | |
| `contactIsRepresentative` | boolean | 代表者フラグ |
| `contactIsPrimary` | boolean | **主担当は1人まで**。true にすると既存の主担当が自動で降りる |
| `contactPhone` | 20文字以内 / null | |
| `contactFax` | 20文字以内 / null | |
| `contactEmail` | メール形式 / null / `""` | |
| `contactSortOrder` | 0以上の整数 | 並び順 |
| `businessIds` | 整数の配列 | 担当事業。PATCH で指定すると**差し替え**（指定しなければ変更しない） |
| `updated_at` | ISO 8601 | PATCH / DELETE の楽観ロック。違えば `409` |

- 名刺画像のURL（`contactBusinessCardFrontUrl` / `...BackUrl`）は ML から送らない運用。
  画像は m2 の画面でアップロードする
- `DELETE` は `updated_at` を本文でもクエリ（`?updatedAt=...`）でも受ける。省略すると
  楽観ロックなしで消える
- `DELETE` の成功は `204`（本文なし）。`Idempotency-Key` を付けた再送も `204`
- レスポンス（POST は `201` / PATCH は `200`）は §1 の `items[]` と同じ形＋`customer_code`

### curl

```bash
# 追加
curl -s -X POST "https://manage.example.test/api/integrations/customers/CST-0001/contacts" \
  -H "Authorization: Bearer WRITE_TOKEN_DUMMY" \
  -H "X-ML-User: %E5%B1%B1%E7%94%B0%E5%A4%AA%E9%83%8E" \
  -H "Idempotency-Key: ml-20261105-0003" \
  -H "Content-Type: application/json" \
  -d '{
        "contactName": "鈴木花子",
        "contactDepartment": "総務部",
        "contactPosition": "課長",
        "contactPhone": "03-1234-5678",
        "contactEmail": "suzuki@example.com",
        "contactIsPrimary": true,
        "businessIds": [5]
      }'

# 更新
curl -s -X PATCH "https://manage.example.test/api/integrations/customers/CST-0001/contacts/31" \
  -H "Authorization: Bearer WRITE_TOKEN_DUMMY" \
  -H "X-ML-User: %E5%B1%B1%E7%94%B0%E5%A4%AA%E9%83%8E" \
  -H "Idempotency-Key: ml-20261105-0004" \
  -H "Content-Type: application/json" \
  -d '{ "updated_at": "2026-11-05T02:00:00.000Z", "contactPosition": "部長" }'

# 削除
curl -s -X DELETE "https://manage.example.test/api/integrations/customers/CST-0001/contacts/31?updatedAt=2026-11-05T02:00:00.000Z" \
  -H "Authorization: Bearer WRITE_TOKEN_DUMMY" \
  -H "X-ML-User: %E5%B1%B1%E7%94%B0%E5%A4%AA%E9%83%8E" \
  -H "Idempotency-Key: ml-20261105-0005" \
  -i
```

---

## 6. m2 → ML の変更通知

ライト事業の案件・その顧客・担当者が m2 で更新されたら（**画面経由でも API 経由でも**）、
ML の受け口へ POST する。ML は通知を受けてから §1・§2 の読み出しAPIを引く。

### env

| 変数 | 内容 |
|---|---|
| `ML_WEBHOOK_URL` | ML の受け口の URL |
| `ML_WEBHOOK_SECRET` | HMAC-SHA256 の鍵 |

**どちらか欠けていたら通知しない（no-op。控えも作らない）。**

### 本文

```json
{
  "event_id": "9f1c7f2e-5a3b-4d61-9c88-0e2b7a5d1234",
  "event_type": "project.updated",
  "occurred_at": "2026-11-05T01:00:00.000Z",
  "project_no": "LIGHT-0077"
}
```

- `event_type`: `project.updated` / `customer.updated` / `customer.contacts.updated`
- 案件の通知は `project_no`、顧客・担当者の通知は `customer_code` だけ
- **値・個人の連絡先・金額は一切入れない**（`tests/lib/ml-notify.test.ts` が検証）
- `event_id` は一意。ML 側は同じ `event_id` を2回受けたら1回として扱うこと

### ヘッダーと署名

| ヘッダー | 内容 |
|---|---|
| `X-M2-Event-Id` | `event_id` と同じ |
| `X-M2-Timestamp` | UNIX 秒 |
| `X-M2-Signature` | `sha256=<hex>` |

署名は **`<X-M2-Timestamp>.<リクエスト本文>`** に対する HMAC-SHA256（hex）。
timestamp を署名対象に含めるのは、本文だけを署名すると同じ本文をあとから何度でも
投げ直せる（リプレイ）ため。ML 側は timestamp が古すぎるものを弾くこと。

```python
# ML 側の検証（Python の例）
import hmac, hashlib
expected = hmac.new(
    secret.encode(), f"{timestamp}.{raw_body}".encode(), hashlib.sha256
).hexdigest()
hmac.compare_digest(expected, signature.removeprefix("sha256="))
```

### ループ防止

**ML から来た更新では通知しない。** 判定は「実行者が ML かどうか」1箇所
（`src/lib/update-actor.ts` の `isMlActor`）で、通知の入口
（`src/lib/ml-scope.ts`）が内側で弾く。呼び出し側に条件を持たせていないので、
更新経路を増やしても漏れない。

### リトライと控え

- 控えは `integration_outbox_events` テーブル。**控えの作成（1行 INSERT）だけは同期**で、
  送信はレスポンス後に回す（編集した人を待たせない）
- 試行は最大5回。間隔は 30秒 → 5分 → 30分 → 3時間
- 上限まで失敗したら `status='failed'` にしてログを残す（`lastError` は `HTTP 503` や
  `Error` のような短い文字列だけ。個人の情報を含めない）
- **本番の cron は実運用されていない**ため、次の通知の発生時に期限の来た `pending` 行を
  まとめて拾う（`integration_idempotency_keys` の遅延削除と同じ方針）。
  通知が一件も発生しない日が続くと失敗分が残り続けるので、cron を動かすようになったら
  `deliverPendingMlNotifications` を定期実行に移すこと

### 通知する更新経路

| 経路 | 通知 |
|---|---|
| `PATCH /api/v1/projects/[id]`（画面・インライン編集・フォーム編集） | ○ |
| `PATCH /api/v1/customers/[id]`（画面） | ○ |
| `POST`/`PATCH`/`DELETE /api/v1/customers/[id]/contacts[/...]`（画面） | ○ |
| `/api/integrations/**` の PATCH（ML 由来） | ×（ループ防止） |
| 案件の新規作成・コピー・CSV取り込み・一括操作 | ×（**未対応**。ML は1日1回の取り込みで拾う） |

---

## 7. 変更履歴

m2 には汎用の変更履歴テーブルが無く、更新者は `updated_by`（`users` への FK）でしか
表せない。ML の利用者は m2 のユーザーではないため FK に載せられないので、ML 由来の変更は
`integration_change_logs` に残す。

| 列 | 内容 |
|---|---|
| `entity_type` | `project` / `customer` / `contact` |
| `entity_id` | `projects.id` / `customers.id` / `customer_contacts.id` |
| `entity_key` | `project_no` / `customer_code`（IDだけでは追えないため併記） |
| `action` | `create` / `update` / `delete` |
| `actor_label` | `ML：山田太郎` |
| `changed_fields` | 変わった**項目名**の配列 |

**値そのものは保存しない。** 顧客名・電話・メールが履歴に溜まると、履歴を読める人の範囲＝
個人情報を読める人の範囲になってしまう。

画面からの更新はここに残さない（`updated_by` に残るため二重に持たない）。

> このテーブルを表示する画面はまだ無い（DB を直接見る前提）。履歴を画面に出すなら別途。

---

## 8. 実装とテスト

| 役割 | ファイル |
|---|---|
| 実行者（画面ユーザー / ML）の抽象 | `src/lib/update-actor.ts` |
| 案件の更新（画面・ML 共通） | `src/lib/project-update.ts` |
| 顧客の更新（画面・ML 共通） | `src/lib/customer-update.ts` |
| 担当者の作成・更新・削除（画面・ML 共通） | `src/lib/customer-contact-update.ts` |
| ML 連携の対象判定・通知の入口 | `src/lib/ml-scope.ts` |
| 通知の控え・HMAC・リトライ | `src/lib/ml-notify.ts` |
| ML 由来の変更履歴 | `src/lib/integration-change-log.ts` |
| 書き込み口の共通入口（認証・冪等・エラー変換） | `src/lib/integration-write.ts` |
| 案件の項目定義・整形 | `src/lib/ml-project-fields.ts` |
| 顧客の項目定義・整形 | `src/lib/ml-customer-fields.ts` |
| 担当者読み出しの整形 | `src/lib/integration-contacts-read.ts` |

テスト: `tests/api/ml-sync.test.ts`（エンドポイント）/ `tests/lib/ml-notify.test.ts`（通知・履歴）。

**更新ロジックは画面と共有している。** `applyProjectUpdate` 等をコピーして ML 用に
書き直すと、ステータス変更の副作用（確定日ラッチ・手数料の凍結・通知）が片方だけに
入る事故が起きる。新しい更新経路を作るときもこの関数を経由すること。
