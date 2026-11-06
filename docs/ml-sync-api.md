# ML管理システム双方向連携 API 仕様書

ML管理システム（`ml-management-system`）と営業管理システム（m2）の間で、**ライト事業**の
案件・顧客・顧客担当者を双方向に編集できるようにするための API。

> 2026-11-05 石井さん：「営業管理システムへは編集のタイミングで修正で上書きして欲しい。逆も然り」

- 対象: env `INTEGRATION_BUSINESS_CODE`（既定 `LIGHT` ＝ ライト事業 / `businessId=5`）に
  紐づく案件・その顧客・顧客の担当者だけ。それ以外はすべて `404`
- 既存の `/api/integrations/contracts`・`/api/integrations/customers`・
  `/api/integrations/customers/import` の挙動は**変えていない**
- レート制限: 60回/分/IP（`/api/integrations/**` 共通・ECSタスクごとの計数）
- **本番反映済み（2026-11-05）。** Prisma マイグレーション
  `20261105100000_add_ml_bidirectional_sync` も本番DBに適用済み。
  `ML_WEBHOOK_URL` / `ML_WEBHOOK_SECRET` は**意図的に未設定**なので、m2 → ML の通知は
  no-op（6章）
- 2026-11-06 追記: ML の MO（マシンオーナー）詳細画面のため、顧客の読み出し口を追加し、
  顧客の書き戻しを「画面で人が直せる項目全部」へ広げた（4章）。
  **MO番号も ML から直せる**（前の番号は履歴に残り、取り込みAPIは前の番号でも顧客を引ける）。
  **この追記分は本番未適用**

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

## 4. 顧客を読む・書き戻す（新規）

```
GET   /api/integrations/customers/by-code/{customer_code}   ← 読み取り用トークン
PATCH /api/integrations/customers/{customer_code}           ← 書き込み用トークン
```

ML の MO（マシンオーナー）詳細画面が使う。**顧客の画面に出ている項目のうち口座以外を
全部返し、人が直せる項目は全部受け付ける。**

> ⚠️ **読みと書きでパスが違う。**
> 既存の `GET /api/integrations/customers/{id}`（取り込みの読み戻し検算用）は**数値ID**・
> 書き込み用トークン・口座あり、で挙動を変えないと決めている。Next.js は同じ階層で別名の
> 動的セグメント（`[id]` と `[customerCode]`）を持てないため、顧客コードでの**読み出しだけ**
> `by-code/` の下に置いた。PATCH は既存 `[id]` と同じ階層で顧客コードを取る。

### 返す項目

| キー | 内容 | 直せる |
|---|---|---|
| `customer_code` | m2 の採番コード（`CST-0001`） | × |
| `customer_url` | 顧客詳細画面のURL | × |
| `mo_no` | MO番号（`custom_fields.mo_no` と同じ値） | ○（下記） |
| `mo_no_previous` | 前のMO番号（古い順の配列） | × |
| `company_name` | 社名 | ○ |
| `customer_salutation` | 呼称（御中・様 など） | ○ |
| `customer_type` | `法人` / `個人事業主` / `個人` / `確認中` / `未設定` | ○ |
| `postal_code` | 郵便番号 | ○ |
| `address` | 住所 | ○ |
| `company_phone` | 会社の電話番号 | ○ |
| `company_fax` | 会社のFAX番号 | ○ |
| `company_email` | 会社のメールアドレス | ○ |
| `website` | ホームページ | ○ |
| `corporate_no` | 法人番号（「なし」「申請中」も入る自由記述） | ○ |
| `invoice_no` | インボイス番号（同じく自由記述） | ○ |
| `capital` | 資本金（円・整数） | ○ |
| `established_on` | 設立日（`YYYY-MM-DD`） | ○ |
| `fiscal_month` | 決算月（1〜12） | ○ |
| `industry` | 業種の**名前** | ○ |
| `industry_options` | 業種に選べる名前の一覧（有効な業種マスタ） | × |
| `folder_url` | 顧客フォルダのURL | ○ |
| `customer_notes` | 備考 | ○ |
| `custom_fields` | ライト事業の事業別カスタム項目（MO番号ほか） | ○ |
| `global_custom_fields` | 全事業共通のカスタム項目 | ○ |
| `version` | 楽観ロック用 | × |
| `updated_at` | 最終更新（ISO 8601） | × |

- **未入力は `null`。キーは落とさない**（ML が画面の欄を固定で埋めるため）
- `custom_fields` / `global_custom_fields` は**定義されている項目だけ**を定義順に返す。
  定義に無いキー（取り込みAPIが内部的に持たせている `contact_roles` など、顧客の画面に
  出ていないもの）は返さない。定義があって値が無いキーは `null` で埋める
- **口座（銀行名・支店・種別・口座番号・名義）は返さない。** 口座を返すのは既存の
  `GET /api/integrations/contracts` と数値ID の GET だけ
- `industry` は名前でやり取りする（m2 の内部IDを ML に覚えさせない）。
  選択肢は `industry_options` をそのまま使う

### 受け付けない項目とその理由

| キー | 理由 |
|---|---|
| `customer_code` | m2 の採番。変えると ML 側の紐づけが切れる |
| `customer_url` / `updated_at` / `version` の書き換え | m2 が決める値（`version` は送るが更新対象ではない） |
| `industry_options` | 業種マスタ（顧客の項目ではない） |
| `custom_fields.mo_no` | MO番号は**トップレベルの `mo_no`** で送る（入口を1つに絞っている）。`custom_fields` 側は `422` |
| `mo_no_previous` | m2 が自動で積む履歴（直接は書けない） |
| 計算項目（定義が `type: "formula"`） | 入力値ではない |
| 口座 | ML は保存しない |

知らないキーは `422`（黙って捨てない。ML 側のタイプミスに気づけるようにする）。

### MO番号（`mo_no`）

MO番号は顧客取り込みAPI（`POST /api/integrations/customers/import`）が**顧客を引くキー**
なので、変えると次の取り込みで同じ顧客が見つからず、もう1件できてしまう。これを防ぐため:

- **変えると前の番号が `mo_no_previous` に残る**（古い順。何回変えても全部残る）。
  取り込みAPI・照合API（`GET /api/integrations/customers?mo_no=`）・契約読み出しの
  `mo_no` 絞り込みは、今の番号で見つからなければ前の番号でも探す
- **他の顧客の今／前の番号と同じなら `422`**（`field` は `mo_no`）。
  どの顧客が使っているか分かるよう、相手の顧客コードを添えて返す
- **`custom_fields.mo_no` は `422`。** トップレベルの `mo_no` で送る（2箇所から違う値が
  来たときにどちらを採るかを決めずに済ませるため）。読み出しでは両方に同じ値が入る
- 空文字・`null` を送ると未入力に戻るが、**前の番号は履歴に残る**ので取り込みAPIは
  引き続き顧客を見つけられる
- 前後の空白は落として保存する

m2 の画面から変えたときも同じ処理（`src/lib/mo-number.ts`）を通り、同じように履歴が残り、
重複は止まる（画面は `400`）。画面から変えたときは ML へ `customer.updated` を通知する。

### カスタム項目の検査

`custom_fields` / `global_custom_fields` は定義（m2 の事業マスタ・システム設定）と
突き合わせる。次はすべて `422`:

- 定義に無いキー → `custom_fields.<キー> は営業管理システムに登録されていない項目です`
- 計算項目 → `… は他の項目から計算される項目のため更新できません`
- `mo_no` → `MO番号は顧客取り込みAPIが管理する項目のため、ここからは更新できません`
- 型違い（数値項目に文字列、`select` に無い選択肢、`date` が `YYYY-MM-DD` でない など）

`field` は `custom_fields.machine_count` のように**送ったキーのまま**返るので、ML は
そのままセルの下に出せる。

### 値の扱い

- `null` と `""` はどちらも「空にする」。m2 側は未入力を `null` で持つので `""` は `null` に寄せる
- `custom_fields` は**送ったキーだけ**が差し替わる（マージ更新）。省いたキーは残る
- 画面の `PATCH /api/v1/customers/[id]` と同じ関数（`src/lib/customer-update.ts` の
  `applyCustomerUpdate`）を通るので、**社名＋電話番号の完全一致の重複チェック**もそのまま
  効く（当たると `409`）
- PATCH のレスポンスは**読み出しと同じ形**。ML が行全体を置き換えても欄が消えない

### レスポンス

```json
{
  "customer_code": "CST-0001",
  "customer_url": "https://manage.example.test/customers/11",
  "mo_no": "MO-0001",
  "mo_no_previous": ["MO-0000"],
  "company_name": "テスト商事",
  "customer_salutation": "御中",
  "customer_type": "法人",
  "postal_code": "153-0051",
  "address": "東京都目黒区中目黒1-1-1",
  "company_phone": "03-1234-5678",
  "company_fax": null,
  "company_email": "info@example.test",
  "website": null,
  "corporate_no": "1234567890123",
  "invoice_no": "T1234567890123",
  "capital": 10000000,
  "established_on": "2015-04-01",
  "fiscal_month": 3,
  "industry": "IT・ソフトウェア",
  "industry_options": ["IT・ソフトウェア", "製造業"],
  "folder_url": null,
  "customer_notes": null,
  "custom_fields": { "mo_no": "MO-0001", "machine_count": 2, "support_plan": null },
  "global_custom_fields": { "intro_route": "展示会" },
  "version": 3,
  "updated_at": "2026-11-06T01:00:00.000Z"
}
```

### curl

```bash
# 1. 読む（編集画面を開く直前。version もここで取る）
curl -s "https://manage.example.test/api/integrations/customers/by-code/CST-0001" \
  -H "Authorization: Bearer READONLY_TOKEN_DUMMY"
```

```bash
# 2. 書き戻す（直した項目だけ送ればよい）
curl -s -X PATCH "https://manage.example.test/api/integrations/customers/CST-0001" \
  -H "Authorization: Bearer WRITE_TOKEN_DUMMY" \
  -H "X-ML-User: %E5%B1%B1%E7%94%B0%E5%A4%AA%E9%83%8E" \
  -H "Idempotency-Key: ml-20261106-0002" \
  -H "Content-Type: application/json" \
  -d '{
        "version": 3,
        "company_name": "テスト商事",
        "postal_code": "153-0051",
        "address": "東京都目黒区中目黒1-1-1",
        "company_phone": "03-1234-5678",
        "industry": "製造業",
        "capital": 10000000,
        "established_on": "2015-04-01",
        "fiscal_month": 3,
        "mo_no": "MO-0002",
        "custom_fields": { "machine_count": 4, "support_plan": "B" },
        "global_custom_fields": { "intro_route": "展示会" }
      }'
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
| 顧客の項目定義・検査・整形 | `src/lib/ml-customer-fields.ts` |
| 顧客1件の読み出し（業種マスタ・カスタム項目定義） | `src/lib/ml-customer-read.ts` |
| MO番号の変更・履歴・重複チェック | `src/lib/mo-number.ts` |
| 担当者読み出しの整形 | `src/lib/integration-contacts-read.ts` |

テスト: `tests/api/ml-sync.test.ts`（エンドポイント）/ `tests/lib/ml-notify.test.ts`（通知・履歴）/
`tests/lib/mo-number.test.ts`（MO番号の履歴）/ `tests/api/customer-mo-number.test.ts`（画面から
MO番号を変えたとき）/ `tests/api/customer-import.test.ts`（前の番号での取り込み）。

**更新ロジックは画面と共有している。** `applyProjectUpdate` 等をコピーして ML 用に
書き直すと、ステータス変更の副作用（確定日ラッチ・手数料の凍結・通知）が片方だけに
入る事故が起きる。新しい更新経路を作るときもこの関数を経由すること。
