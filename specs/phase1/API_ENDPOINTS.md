# Phase 1: API仕様書

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [00_PROJECT_PRD.md](../00_PROJECT_PRD.md) | API設計方針、レスポンス形式、エラーコード |
> | [01_DATA_MODEL.md](../01_DATA_MODEL.md) | テーブル定義、命名規則、楽観的ロック、論理削除 |
> | [CUSTOMER_DESIGN.md](./CUSTOMER_DESIGN.md) | 顧客マスタ詳細設計 |

---

## 目次

1. [共通仕様](#1-共通仕様)
2. [顧客マスタ API](#2-顧客マスタ-api)
3. [代理店マスタ API](#3-代理店マスタ-api)
4. [事業定義 API](#4-事業定義-api)
5. [ユーザー設定 API](#5-ユーザー設定-api)
6. [運用監視・ログ](#6-運用監視ログ)

---

## 1. 共通仕様

### 1.1 認証方式

全APIエンドポイントは認証必須。NextAuth.jsが発行するJWTトークンをBearerトークンとして送信する。

```
Authorization: Bearer <JWT token>
```

トークンが無効または未指定の場合、`401 UNAUTHORIZED` を返却する。

### 1.2 ベースURL

```
/api/v1/<resource>
```

### 1.3 snake_case / camelCase 変換ルール

| レイヤー | 命名規則 | 例 |
|---------|---------|---|
| データベースカラム | snake_case | `customer_name`, `customer_is_active` |
| APIリクエスト/レスポンス | camelCase | `customerName`, `customerIsActive` |

変換はサーバーサイドで自動的に行う。クライアントは全てcamelCaseで送受信する。

### 1.4 統一レスポンス形式

#### 成功（一覧）

```json
{
  "success": true,
  "data": [
    { "id": 1, "customerCode": "CST-0001", "customerName": "株式会社サンプルテック" }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "pageSize": 25,
    "totalPages": 4
  }
}
```

#### 成功（単体）

```json
{
  "success": true,
  "data": {
    "id": 1,
    "customerCode": "CST-0001",
    "customerName": "株式会社サンプルテック"
  }
}
```

#### エラー

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容にエラーがあります",
    "details": [
      { "field": "customerName", "message": "顧客名は必須です" }
    ]
  }
}
```

### 1.5 エラーコード一覧

| エラーコード | HTTPステータス | 説明 |
|------------|--------------|------|
| `VALIDATION_ERROR` | 400 | リクエストパラメータのバリデーションエラー |
| `UNAUTHORIZED` | 401 | 認証トークンが無効または未指定 |
| `FORBIDDEN` | 403 | アクセス権限がない |
| `NOT_FOUND` | 404 | 対象リソースが存在しない |
| `CONFLICT` | 409 | 楽観的ロックの競合、またはユニーク制約違反 |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー |

### 1.6 共通クエリパラメータ（一覧API）

全ての一覧取得APIで以下のクエリパラメータを使用可能。

| パラメータ | 型 | デフォルト | 説明 |
|----------|---|----------|------|
| `page` | number | `1` | ページ番号（1始まり） |
| `pageSize` | number | `25` | 1ページあたりの件数（最大100） |
| `search` | string | - | フリーテキスト検索（対象フィールドはリソースごとに定義） |
| `sort` | string | リソースごとのデフォルト | 複数列ソート。`field1:asc,field2:desc` 形式（カンマ区切り）。後方互換として `sortField` / `sortDirection` も受付 |
| `includeInactive` | boolean | `false` | `true`の場合、論理削除済みレコードも含める |

### 1.7 楽観的ロック仕様

対象テーブル: `customers`, `partners`, `projects`

#### 動作フロー

1. クライアントがリソース取得時に`version`フィールドを受け取る
2. 更新リクエスト（PATCH）のBody に`version`を含める
3. サーバーはDB上の現在の`version`と比較
4. 一致する場合: 更新を実行し、`version`を+1インクリメント
5. 不一致の場合: `409 CONFLICT`を返却

#### 競合時のレスポンス

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "このレコードは他のユーザーにより更新されました。最新データを確認してください。",
    "details": {
      "currentVersion": 4,
      "yourVersion": 3
    }
  }
}
```

### 1.8 楽観的ロック競合時の詳細仕様

#### 409レスポンス形式

```json
{
  "success": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "他のユーザーによって更新されています",
    "details": {
      "currentVersion": 6,
      "submittedVersion": 5,
      "updatedBy": "佐藤花子",
      "updatedAt": "2026-02-21T10:30:00Z"
    }
  }
}
```

#### 競合解決戦略: Server Wins（Phase 1）

| 項目 | 仕様 |
|---|---|
| 戦略 | Server Wins — ユーザーの変更を破棄し最新データを再ロード |
| フロー | 409受信 → ConflictErrorModal表示 → 最新データ取得 → フォームリセット |
| クライアント動作 | PUT/PATCH送信時にversionフィールドを必ず含める |
| 強制上書き | Phase 1では非対応（Phase 2で管理者限定で検討） |

#### フロー図

```
ユーザーA: GET /customers/1 (version=5)
                                    ユーザーB: GET /customers/1 (version=5)
                                    ユーザーB: PUT /customers/1 {version:5} → 200 (version=6)
ユーザーA: PUT /customers/1 {version:5}
→ 409 VERSION_CONFLICT {currentVersion:6, submittedVersion:5}
→ クライアント: ConflictErrorModal表示
→ ユーザーA: 「最新データを読み込む」クリック
→ GET /customers/1 → 200 (version=6)
→ フォームを最新データでリセット
```

### 1.9 論理削除仕様

- DELETEリクエストは物理削除ではなく、`is_active = false`に更新する
- 一覧APIはデフォルトで`is_active = true`のレコードのみ返却する
- `includeInactive=true`クエリパラメータで無効レコードも取得可能
- 論理削除時に子レコード（contacts, business_links等）は変更しない
- 復元は専用エンドポイント（`PATCH /:id/restore`）で行う

### 1.10 ロール別アクセス権限

| ロール | 説明 | 基本権限 |
|-------|------|---------|
| `admin` | 管理者 | 全操作可能 |
| `staff` | 担当者 | 所属事業のCRUD |
| `partner_admin` | 代理店管理者 | 自社関連データのCRUD |
| `partner_staff` | 代理店担当者 | 自社関連データの閲覧のみ |

### 1.11 性能要件

#### レスポンスタイム目標

| 操作 | 95パーセンタイル目標 | データ量前提 |
|---|---|---|
| 一覧取得（GET /entities） | 500ms以下 | 10,000件 |
| 単体取得（GET /entities/:id） | 200ms以下 | - |
| 作成（POST /entities） | 300ms以下 | - |
| 更新（PUT /entities/:id） | 300ms以下 | - |
| 削除（DELETE /entities/:id） | 200ms以下 | - |
| 検索（search パラメータ） | 800ms以下 | 10,000件、部分一致検索 |
| バッチ操作 | 2000ms以下 | 最大50件同時 |

#### 同時接続要件

| 指標 | 目標値 |
|---|---|
| 同時接続ユーザー数 | 50ユーザー |
| 1ユーザーあたりリクエスト頻度 | 最大10req/min |
| APIレート制限 | 100req/min/user |

#### 性能テストチェックリスト

- [ ] 顧客10,000件でのGET /api/v1/customers（pageSize=25）が500ms以内
- [ ] 顧客10,000件でのsearch検索が800ms以内
- [ ] 代理店5,000件でのGET /api/v1/partnersが500ms以内
- [ ] 50件同時バッチ削除が2000ms以内
- [ ] Lighthouse Performance スコア 80以上（一覧画面）

### 1.12 エラーハンドリング詳細

#### エラーコード拡張

| コード | HTTPステータス | 説明 | クライアント側の対処 |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | バリデーションエラー | フィールド単位でエラーメッセージ表示 |
| `UNAUTHORIZED` | 401 | 未認証 | ログイン画面にリダイレクト |
| `FORBIDDEN` | 403 | 権限不足 | 「権限がありません」トースト表示 |
| `NOT_FOUND` | 404 | リソースなし | 「データが見つかりません」表示 + 一覧に戻る |
| `VERSION_CONFLICT` | 409 | 楽観的ロック競合 | ConflictErrorModal表示 |
| `DUPLICATE_ENTRY` | 409 | ユニーク制約違反 | 重複フィールドにエラーメッセージ |
| `CODE_GENERATION_FAILED` | 503 | 採番失敗 | 「しばらく待ってから再試行してください」トースト |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー | 「システムエラーが発生しました」トースト |

#### ネットワークエラーハンドリング

| エラー種別 | 検出方法 | クライアント動作 |
|---|---|---|
| タイムアウト | fetch timeout 30秒 | 「通信がタイムアウトしました。再試行してください」トースト |
| ネットワーク切断 | navigator.onLine === false | 画面上部にオフラインバナー表示 |
| 5xx エラー | status >= 500 | 「サーバーエラーが発生しました」トースト + 自動リトライ（最大2回、3秒間隔） |
| レート制限 | status === 429 | 「リクエストが多すぎます。しばらくお待ちください」トースト |

---

## 2. 顧客マスタ API

### 2.1 GET /api/v1/customers

**説明**: 顧客一覧を取得する。検索、フィルター、ソート、ページネーションに対応。

**認可**: `admin`, `staff`, `partner_admin`, `partner_staff`

#### リクエスト

**Query Parameters**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|----------|---|------|----------|------|
| `page` | number | - | `1` | ページ番号 |
| `pageSize` | number | - | `25` | 1ページあたりの件数 |
| `search` | string | - | - | 顧客名・顧客コードで部分一致検索 |
| `sort` | string | - | `customerCode:asc` | 複数列ソート。全カラム対応（例: `customerCode:asc,customerName:desc`） |
| `includeInactive` | boolean | - | `false` | 無効顧客を含めるか |
| `industryId` | number | - | - | 業種ID フィルター（業種マスタの ID） |
| `customerType` | string | - | - | 種別フィルター（法人/個人事業主/個人/確認中/未設定） |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "customerCode": "CST-0001",
      "customerName": "株式会社サンプルテック",
      "customerSalutation": "サンプルテック",
      "customerType": "法人",
      "industryId": 3,
      "industry": { "id": 3, "industryName": "製造業" },
      "customerPhone": "03-1234-5678",
      "customerEmail": "info@sample-tech.co.jp",
      "customerIsActive": true,
      "contactCount": 2,
      "projectCount": 3,
      "updatedAt": "2026-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "pageSize": 25,
    "totalPages": 1
  }
}
```

**特記事項**:
- `contactCount`と`projectCount`はリレーションの集計値として付与する
- `partner_admin` / `partner_staff` は自社案件に紐づく顧客のみ閲覧可能

---

### 2.2 POST /api/v1/customers

**説明**: 新しい顧客を作成する。顧客コード（`CST-XXXX`）は自動採番。

**認可**: `admin`, `staff`

#### リクエスト

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `customerName` | string | 必須 | 顧客名（会社名）。1〜200文字 |
| `customerSalutation` | string | - | 呼称（社内での呼び名・通称）。100文字以内 |
| `customerType` | string | - | 種別。法人/個人事業主/個人/確認中/未設定。デフォルト `未設定` |
| `customerPostalCode` | string | - | 郵便番号（例: `100-0001`） |
| `customerAddress` | string | - | 住所 |
| `customerPhone` | string | - | 電話番号 |
| `customerFax` | string | - | FAX番号 |
| `customerEmail` | string | - | メールアドレス |
| `customerWebsite` | string | - | WebサイトURL |
| `industryId` | number | - | 業種ID（業種マスタの ID） |
| `customerCorporateNumber` | string | - | 法人番号。13桁の数字 |
| `customerInvoiceNumber` | string | - | インボイス番号。T+13桁の数字 |
| `customerCapital` | number | - | 資本金（円） |
| `customerEstablishedDate` | string (date) | - | 設立年月日（YYYY-MM-DD形式） |
| `customerFolderUrl` | string | - | 顧客フォルダURL |
| `customerNotes` | string | - | 備考 |

```json
{
  "customerName": "株式会社テスト企業",
  "customerSalutation": "テスト企業",
  "customerType": "法人",
  "customerPostalCode": "150-0001",
  "customerAddress": "東京都渋谷区神宮前1-1-1",
  "customerPhone": "03-9999-8888",
  "customerFax": "03-9999-8889",
  "customerEmail": "info@test-company.co.jp",
  "industryId": 1,
  "customerCorporateNumber": "1234567890123",
  "customerInvoiceNumber": "T1234567890123",
  "customerCapital": 10000000,
  "customerEstablishedDate": "2020-04-01"
}
```

#### レスポンス

**成功（201）**:

```json
{
  "success": true,
  "data": {
    "id": 6,
    "customerCode": "CST-0006",
    "customerName": "株式会社テスト企業",
    "customerSalutation": "テスト企業",
    "customerType": "法人",
    "customerPostalCode": "150-0001",
    "customerAddress": "東京都渋谷区神宮前1-1-1",
    "customerPhone": "03-9999-8888",
    "customerFax": "03-9999-8889",
    "customerEmail": "info@test-company.co.jp",
    "customerWebsite": null,
    "industryId": 1,
    "industry": { "id": 1, "industryName": "IT・ソフトウェア" },
    "customerCorporateNumber": "1234567890123",
    "customerInvoiceNumber": "T1234567890123",
    "customerCapital": 10000000,
    "customerEstablishedDate": "2020-04-01",
    "customerFolderUrl": null,
    "customerNotes": null,
    "customerIsActive": true,
    "version": 1,
    "createdAt": "2026-02-19T09:00:00.000Z",
    "updatedAt": "2026-02-19T09:00:00.000Z"
  }
}
```

**エラー（400）**:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容にエラーがあります",
    "details": [
      { "field": "customerName", "message": "顧客名は必須です" }
    ]
  }
}
```

**特記事項**:
- `customerCode`はサーバーサイドで自動採番（`CST-XXXX`形式、4桁ゼロパディング）
- UNIQUE制約違反時は最大3回リトライ
- 重複チェック: 会社名 + 電話番号の組み合わせが既存レコードと一致する場合、`409 CONFLICT`を返却

---

### 2.3 GET /api/v1/customers/:id

**説明**: 指定IDの顧客詳細を取得する。

**認可**: `admin`, `staff`, `partner_admin`, `partner_staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "customerCode": "CST-0001",
    "customerName": "株式会社サンプルテック",
    "customerSalutation": "サンプルテック",
    "customerType": "法人",
    "customerPostalCode": "100-0001",
    "customerAddress": "東京都千代田区千代田1-1-1",
    "customerPhone": "03-1234-5678",
    "customerFax": "03-1234-5679",
    "customerEmail": "info@sample-tech.co.jp",
    "customerWebsite": null,
    "industryId": 3,
    "industry": { "id": 3, "industryName": "製造業" },
    "customerCorporateNumber": "1234567890123",
    "customerInvoiceNumber": "T1234567890123",
    "customerCapital": 50000000,
    "customerEstablishedDate": "2000-04-01",
    "customerFolderUrl": "https://drive.google.com/drive/folders/xxx",
    "customerNotes": null,
    "customerIsActive": true,
    "version": 1,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-15T10:30:00.000Z",
    "createdBy": 1,
    "updatedBy": 1,
    "contactCount": 2,
    "projectCount": 3
  }
}
```

**エラー（404）**:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "顧客が見つかりません"
  }
}
```

---

### 2.4 PATCH /api/v1/customers/:id

**説明**: 指定IDの顧客を更新する。楽観的ロックにより同時編集を防止する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |

**Body (JSON)**:

`POST /api/v1/customers` と同一フィールドに加え、`version`が必須。

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `version` | number | 必須 | 楽観的ロック用バージョン番号 |
| その他フィールド | - | - | POST と同一（変更するフィールドのみ送信可能） |

```json
{
  "customerName": "株式会社サンプルテック（更新）",
  "customerEmployeeCount": 200,
  "version": 1
}
```

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "customerCode": "CST-0001",
    "customerName": "株式会社サンプルテック（更新）",
    "customerEmployeeCount": 200,
    "version": 2,
    "updatedAt": "2026-02-19T10:00:00.000Z"
  }
}
```

**エラー（409 - 楽観的ロック競合）**:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "このレコードは他のユーザーにより更新されました。最新データを確認してください。",
    "details": {
      "currentVersion": 2,
      "yourVersion": 1
    }
  }
}
```

**特記事項**:
- 更新成功時は`version`が+1インクリメントされる
- 論理削除済み（`customerIsActive = false`）のレコードは更新不可（`403 FORBIDDEN`）

---

### 2.5 DELETE /api/v1/customers/:id

**説明**: 指定IDの顧客を論理削除する（`customerIsActive = false`に更新）。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |

#### レスポンス

**成功（204 No Content）**: レスポンスボディなし

**エラー（404）**:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "顧客が見つかりません"
  }
}
```

**特記事項**:
- 子データ（`customer_contacts`, `customer_business_links`）は変更しない
- 既に論理削除済みの場合は`404 NOT_FOUND`を返却

---

### 2.6 PATCH /api/v1/customers/:id/restore

**説明**: 論理削除済みの顧客を復元する（`customerIsActive = true`に更新）。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "customerCode": "CST-0001",
    "customerName": "株式会社サンプルテック",
    "customerIsActive": true,
    "version": 1,
    "updatedAt": "2026-02-19T11:00:00.000Z"
  }
}
```

**特記事項**:
- 既にアクティブなレコードに対して実行した場合は`400 VALIDATION_ERROR`を返却

---

### 2.7 GET /api/v1/customers/filter-options

**説明**: 顧客一覧のフィルター用選択肢を取得する。

**認可**: `admin`, `staff`, `partner_admin`, `partner_staff`

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "industryId": [
      { "value": 1, "label": "IT・ソフトウェア" },
      { "value": 2, "label": "建設・不動産" },
      { "value": 3, "label": "製造業" },
      { "value": 4, "label": "小売・卸売" }
    ],
    "customerType": [
      "法人",
      "個人事業主",
      "個人",
      "確認中",
      "未設定"
    ]
  }
}
```

**特記事項**:
- `industryId`はIndustryマスタテーブルの`isActive: true`のレコードから取得

---

### 2.8 GET /api/v1/customers/:id/contacts

**説明**: 指定顧客の担当者一覧を取得する。

**認可**: `admin`, `staff`, `partner_admin`, `partner_staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "customerId": 1,
      "contactName": "山田太郎",
      "contactDepartment": "代表取締役",
      "contactPosition": "代表取締役社長",
      "contactIsRepresentative": true,
      "contactPhone": "03-1234-5678",
      "contactFax": null,
      "contactEmail": "yamada@sample-tech.co.jp",
      "contactBusinessCardFrontUrl": null,
      "contactBusinessCardBackUrl": null,
      "contactIsPrimary": true,
      "contactSortOrder": 0,
      "businesses": [],
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "customerId": 1,
      "contactName": "中村浩二",
      "contactDepartment": "設備部",
      "contactPosition": "課長",
      "contactIsRepresentative": false,
      "contactPhone": "03-1234-5679",
      "contactFax": "03-1234-5680",
      "contactEmail": "nakamura@sample-tech.co.jp",
      "contactBusinessCardFrontUrl": null,
      "contactBusinessCardBackUrl": null,
      "contactIsPrimary": false,
      "contactSortOrder": 1,
      "businesses": [
        { "id": 1, "businessName": "事業A" },
        { "id": 2, "businessName": "事業B" }
      ],
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**特記事項**:
- `businesses`は`customer_contact_business_links`経由で紐付いた事業の配列を返却
- 紐付き事業がない場合は空配列`[]`を返却
- `contactSortOrder`の昇順でソート
- `contactIsRepresentative = true`の担当者は代表者を示す

---

### 2.9 POST /api/v1/customers/:id/contacts

**説明**: 指定顧客に担当者を追加する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `contactName` | string | 必須 | 担当者名。1〜100文字 |
| `contactDepartment` | string | - | 部署名。100文字以内 |
| `contactPosition` | string | - | 役職。100文字以内 |
| `contactIsRepresentative` | boolean | - | 代表者フラグ。デフォルト`false` |
| `contactPhone` | string | - | 電話番号 |
| `contactFax` | string | - | FAX番号 |
| `contactEmail` | string | - | メールアドレス |
| `contactBusinessCardFrontUrl` | string | - | 名刺画像URL（表） |
| `contactBusinessCardBackUrl` | string | - | 名刺画像URL（裏） |
| `contactIsPrimary` | boolean | - | 主担当フラグ。デフォルト`false` |
| `businessIds` | number[] | - | 担当事業IDの配列。デフォルト`[]` |

```json
{
  "contactName": "鈴木花子",
  "contactDepartment": "営業部",
  "contactPosition": "主任",
  "contactIsRepresentative": false,
  "contactPhone": "03-1111-2222",
  "contactFax": "03-1111-2223",
  "contactEmail": "suzuki@sample-tech.co.jp",
  "contactIsPrimary": false,
  "businessIds": [1, 2]
}
```

#### レスポンス

**成功（201）**:

```json
{
  "success": true,
  "data": {
    "id": 3,
    "customerId": 1,
    "contactName": "鈴木花子",
    "contactDepartment": "営業部",
    "contactPosition": "主任",
    "contactIsRepresentative": false,
    "contactPhone": "03-1111-2222",
    "contactFax": "03-1111-2223",
    "contactEmail": "suzuki@sample-tech.co.jp",
    "contactBusinessCardFrontUrl": null,
    "contactBusinessCardBackUrl": null,
    "contactIsPrimary": false,
    "contactSortOrder": 2,
    "businesses": [
      { "id": 1, "businessName": "事業A" },
      { "id": 2, "businessName": "事業B" }
    ],
    "createdAt": "2026-02-19T09:00:00.000Z",
    "updatedAt": "2026-02-19T09:00:00.000Z"
  }
}
```

**特記事項**:
- `contactIsPrimary = true`で作成した場合、同じ顧客内の既存の主担当者は自動的に`contactIsPrimary = false`に更新される
- `contactSortOrder`は既存担当者の最大値+1を自動設定
- `businessIds`が指定された場合、`customer_contact_business_links`に紐付けレコードを作成する

---

### 2.10 PATCH /api/v1/customers/:id/contacts/:contactId

**説明**: 指定顧客の担当者情報を更新する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |
| `contactId` | number | 担当者ID |

**Body (JSON)**: `POST /api/v1/customers/:id/contacts` と同一フィールド（変更するフィールドのみ）

#### レスポンス

**成功（200）**: 更新後の担当者データを返却（POST成功時と同一形式）

**特記事項**:
- `contactId`が`id`の顧客に属さない場合は`404 NOT_FOUND`を返却
- 主担当の排他制御はPOSTと同様
- `businessIds`が指定された場合、`customer_contact_business_links`の紐付けを差し替え（既存レコードを削除→新規作成）

---

### 2.11 DELETE /api/v1/customers/:id/contacts/:contactId

**説明**: 指定顧客の担当者を物理削除する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |
| `contactId` | number | 担当者ID |

#### レスポンス

**成功（204 No Content）**: レスポンスボディなし

**特記事項**:
- 担当者は論理削除ではなく物理削除
- `contactId`が`id`の顧客に属さない場合は`404 NOT_FOUND`を返却
- 担当者削除時、関連する`customer_contact_business_links`レコードも`onDelete: Cascade`により自動削除される

---

### 2.12 GET /api/v1/customers/:id/business-links

**説明**: 指定顧客の事業リンク一覧を取得する。

**認可**: `admin`, `staff`, `partner_admin`, `partner_staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "customerId": 1,
      "businessId": 1,
      "linkStatus": "active",
      "linkCustomData": {},
      "businessName": "MOAG事業",
      "businessCode": "moag",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "customerId": 1,
      "businessId": 2,
      "linkStatus": "active",
      "linkCustomData": {},
      "businessName": "サービスA事業",
      "businessCode": "service_a",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**特記事項**:
- `businessName`、`businessCode`はリレーション先の`businesses`テーブルから結合して返却

---

### 2.13 POST /api/v1/customers/:id/business-links

**説明**: 指定顧客に事業リンクを追加する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `businessId` | number | 必須 | 事業ID |
| `linkStatus` | string | - | リンク状態。デフォルト `active` |
| `linkCustomData` | object | - | 事業固有の顧客情報（JSON）。デフォルト `{}` |

```json
{
  "businessId": 3,
  "linkStatus": "active",
  "linkCustomData": {
    "equipment_scale": "中規模"
  }
}
```

#### レスポンス

**成功（201）**: 作成されたリンクデータを返却

**エラー（409）**:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "この顧客は既に指定事業に紐付けられています"
  }
}
```

**特記事項**:
- `(customerId, businessId)`の組み合わせにUNIQUE制約がある
- 既に同じ組み合わせが存在する場合は`409 CONFLICT`を返却

---

### 2.14 PATCH /api/v1/customers/:id/business-links/:linkId

**説明**: 指定顧客の事業リンクを更新する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |
| `linkId` | number | リンクID |

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `linkStatus` | string | - | リンク状態（`active` / `inactive`） |
| `linkCustomData` | object | - | 事業固有の顧客情報（JSON） |

#### レスポンス

**成功（200）**: 更新後のリンクデータを返却

---

### 2.15 DELETE /api/v1/customers/:id/business-links/:linkId

**説明**: 指定顧客の事業リンクを物理削除する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 顧客ID |
| `linkId` | number | リンクID |

#### レスポンス

**成功（204 No Content）**: レスポンスボディなし

**特記事項**:
- 事業リンクは物理削除
- 該当事業に紐づく案件が存在する場合は削除不可（`409 CONFLICT`）

---

### 2.16 POST /api/v1/customers/batch/delete

**説明**: 複数の顧客を一括で論理削除する。

**認可**: `admin`

#### リクエスト

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `ids` | number[] | 必須 | 対象顧客IDの配列 |

```json
{
  "ids": [1, 2, 3]
}
```

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "deletedCount": 3,
    "skippedCount": 0,
    "skippedIds": []
  }
}
```

**特記事項**:
- 既に論理削除済みのIDはスキップし、`skippedIds`に含める
- 存在しないIDもスキップ対象

---

## 3. 代理店マスタ API

### 3.1 GET /api/v1/partners

**説明**: 代理店一覧を取得する。検索、フィルター、ソート、ページネーションに対応。

**認可**: `admin`, `staff`, `partner_admin`（自社および下位代理店のみ）, `partner_staff`（自社および下位代理店のみ）

#### リクエスト

**Query Parameters**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|----------|---|------|----------|------|
| `page` | number | - | `1` | ページ番号 |
| `pageSize` | number | - | `25` | 1ページあたりの件数 |
| `search` | string | - | - | 代理店名・代理店コードで部分一致検索 |
| `sort` | string | - | `partnerCode:asc` | 複数列ソート。全カラム対応（例: `partnerCode:asc,partnerName:desc`） |
| `includeInactive` | boolean | - | `false` | 無効代理店を含めるか |
| `partnerHierarchy` | string | - | - | 全社マスタ階層フィルター |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "partnerCode": "AG-0001",
      "partnerName": "代理店A株式会社",
      "partnerParentId": null,
      "partnerHierarchy": "1次代理店",
      "partnerPhone": "03-1111-1111",
      "partnerEmail": "info@agency-a.co.jp",
      "partnerContractStartDate": "2025-04-01",
      "partnerContractEndDate": null,
      "partnerIsActive": true,
      "contactCount": 2,
      "projectCount": 5,
      "parentPartnerName": null,
      "updatedAt": "2026-01-10T08:00:00.000Z"
    }
  ],
  "meta": {
    "total": 10,
    "page": 1,
    "pageSize": 25,
    "totalPages": 1
  }
}
```

**特記事項**:
- `parentPartnerName`は`partnerParentId`で参照される親代理店の名称
- `contactCount`、`projectCount`はリレーションの集計値

---

### 3.2 POST /api/v1/partners

**説明**: 新しい代理店を作成する。代理店コード（`AG-XXXX`）は自動採番。

**認可**: `admin`, `staff`

#### リクエスト

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `partnerName` | string | 必須 | 代理店名（会社名）。1〜200文字 |
| `partnerParentId` | number | - | 親代理店ID（全社マスタ階層） |
| `partnerHierarchy` | string | - | 全社マスタ階層レベル。デフォルト `1次代理店` |
| `partnerPostalCode` | string | - | 郵便番号 |
| `partnerAddress` | string | - | 住所 |
| `partnerPhone` | string | - | 電話番号 |
| `partnerEmail` | string | - | メールアドレス |
| `partnerWebsite` | string | - | WebサイトURL |
| `partnerContractStartDate` | string (date) | - | 契約開始日 |
| `partnerContractEndDate` | string (date) | - | 契約終了日 |
| `partnerNotes` | string | - | 備考 |

```json
{
  "partnerName": "代理店B株式会社",
  "partnerParentId": 1,
  "partnerHierarchy": "2次代理店",
  "partnerPostalCode": "160-0001",
  "partnerAddress": "東京都新宿区...",
  "partnerPhone": "03-2222-3333",
  "partnerEmail": "info@agency-b.co.jp",
  "partnerContractStartDate": "2026-01-01"
}
```

#### レスポンス

**成功（201）**:

```json
{
  "success": true,
  "data": {
    "id": 2,
    "partnerCode": "AG-0002",
    "partnerName": "代理店B株式会社",
    "partnerParentId": 1,
    "partnerHierarchy": "2次代理店",
    "partnerPostalCode": "160-0001",
    "partnerAddress": "東京都新宿区...",
    "partnerPhone": "03-2222-3333",
    "partnerEmail": "info@agency-b.co.jp",
    "partnerWebsite": null,
    "partnerContractStartDate": "2026-01-01",
    "partnerContractEndDate": null,
    "partnerNotes": null,
    "partnerIsActive": true,
    "version": 1,
    "createdAt": "2026-02-19T09:00:00.000Z",
    "updatedAt": "2026-02-19T09:00:00.000Z"
  }
}
```

**特記事項**:
- `partnerCode`はサーバーサイドで自動採番（`AG-XXXX`形式、4桁ゼロパディング）
- `partnerParentId`が指定された場合、指定IDの代理店が存在しアクティブであることを検証する

---

### 3.3 GET /api/v1/partners/:id

**説明**: 指定IDの代理店詳細を取得する。

**認可**: `admin`, `staff`, `partner_admin`（自社のみ）, `partner_staff`（自社のみ）

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "partnerCode": "AG-0001",
    "partnerName": "代理店A株式会社",
    "partnerParentId": null,
    "partnerHierarchy": "1次代理店",
    "partnerPostalCode": "100-0001",
    "partnerAddress": "東京都千代田区...",
    "partnerPhone": "03-1111-1111",
    "partnerEmail": "info@agency-a.co.jp",
    "partnerWebsite": "https://agency-a.co.jp",
    "partnerContractStartDate": "2025-04-01",
    "partnerContractEndDate": null,
    "partnerNotes": null,
    "partnerIsActive": true,
    "version": 1,
    "createdAt": "2025-04-01T00:00:00.000Z",
    "updatedAt": "2026-01-10T08:00:00.000Z",
    "createdBy": 1,
    "updatedBy": 1,
    "parentPartnerName": null,
    "contactCount": 2,
    "projectCount": 5
  }
}
```

**エラー（404）**:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "代理店が見つかりません"
  }
}
```

---

### 3.4 PATCH /api/v1/partners/:id

**説明**: 指定IDの代理店を更新する。楽観的ロックにより同時編集を防止する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |

**Body (JSON)**: `POST /api/v1/partners` と同一フィールドに加え、`version`が必須。

```json
{
  "partnerName": "代理店A株式会社（更新）",
  "version": 1
}
```

#### レスポンス

**成功（200）**: 更新後の代理店データを返却（`version`が+1インクリメント）

**エラー（409）**: 楽観的ロック競合（顧客マスタと同一形式）

**特記事項**:
- 楽観的ロック仕様は顧客マスタと同一
- 論理削除済みのレコードは更新不可（`403 FORBIDDEN`）

---

### 3.5 DELETE /api/v1/partners/:id

**説明**: 指定IDの代理店を論理削除する（`partnerIsActive = false`に更新）。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |

#### レスポンス

**成功（204 No Content）**: レスポンスボディなし

**特記事項**:
- 子データ（`partner_contacts`, `partner_business_links`）は変更しない
- 子代理店（`partnerParentId`で参照しているレコード）も変更しない

---

### 3.6 PATCH /api/v1/partners/:id/restore

**説明**: 論理削除済みの代理店を復元する。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |

#### レスポンス

**成功（200）**: 復元後の代理店データを返却

---

### 3.7 GET /api/v1/partners/filter-options

**説明**: 代理店一覧のフィルター用選択肢を取得する。

**認可**: `admin`, `staff`, `partner_admin`, `partner_staff`

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "partnerHierarchy": [
      "1次代理店",
      "2次代理店"
    ]
  }
}
```

---

### 3.8 GET /api/v1/partners/:id/contacts

**説明**: 指定代理店の担当者一覧を取得する。

**認可**: `admin`, `staff`, `partner_admin`（自社のみ）, `partner_staff`（自社のみ）

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "partnerId": 1,
      "contactName": "代理店太郎",
      "contactDepartment": "営業部",
      "contactPosition": "部長",
      "contactPhone": "03-1111-1111",
      "contactEmail": "taro@agency-a.co.jp",
      "contactIsPrimary": true,
      "contactSortOrder": 0,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**特記事項**:
- 代理店担当者は顧客担当者と異なり`businessId`を持たない
- `contactSortOrder`の昇順でソート

---

### 3.9 POST /api/v1/partners/:id/contacts

**説明**: 指定代理店に担当者を追加する。

**認可**: `admin`, `staff`, `partner_admin`（自社のみ）

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `contactName` | string | 必須 | 担当者名。1〜100文字 |
| `contactDepartment` | string | - | 部署名。100文字以内 |
| `contactPosition` | string | - | 役職。100文字以内 |
| `contactPhone` | string | - | 電話番号 |
| `contactEmail` | string | - | メールアドレス |
| `contactIsPrimary` | boolean | - | 主担当フラグ。デフォルト`false` |

#### レスポンス

**成功（201）**: 作成された担当者データを返却

**特記事項**:
- 主担当の排他制御: `contactIsPrimary = true`で作成した場合、既存の主担当者は自動的に`false`に更新

---

### 3.10 PATCH /api/v1/partners/:id/contacts/:contactId

**説明**: 指定代理店の担当者情報を更新する。

**認可**: `admin`, `staff`, `partner_admin`（自社のみ）

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |
| `contactId` | number | 担当者ID |

**Body (JSON)**: `POST /api/v1/partners/:id/contacts` と同一フィールド

#### レスポンス

**成功（200）**: 更新後の担当者データを返却

---

### 3.11 DELETE /api/v1/partners/:id/contacts/:contactId

**説明**: 指定代理店の担当者を物理削除する。

**認可**: `admin`, `staff`, `partner_admin`（自社のみ）

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |
| `contactId` | number | 担当者ID |

#### レスポンス

**成功（204 No Content）**: レスポンスボディなし

---

### 3.12 GET /api/v1/partners/:id/business-links

**説明**: 指定代理店の事業リンク一覧を取得する。

**認可**: `admin`, `staff`, `partner_admin`（自社のみ）, `partner_staff`（自社のみ）

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "partnerId": 1,
      "businessId": 1,
      "linkStatus": "active",
      "linkHierarchyLevel": "1",
      "linkCommissionRate": 10.00,
      "linkDisplayOrder": 0,
      "linkStartDate": "2025-04-01",
      "linkEndDate": null,
      "linkCustomData": {},
      "businessName": "MOAG事業",
      "businessCode": "moag",
      "createdAt": "2025-04-01T00:00:00.000Z",
      "updatedAt": "2025-04-01T00:00:00.000Z"
    }
  ]
}
```

**特記事項**:
- `linkHierarchyLevel`は事業内階層（全社マスタ階層の`partnerHierarchy`とは独立）
- `linkCommissionRate`は事業内の手数料率（パーセント）

---

### 3.13 POST /api/v1/partners/:id/business-links

**説明**: 指定代理店に事業リンクを追加する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `businessId` | number | 必須 | 事業ID |
| `linkStatus` | string | - | リンク状態。デフォルト `active` |
| `linkHierarchyLevel` | string | - | 事業内階層（例: `1`, `1-2`） |
| `linkCommissionRate` | number | - | 手数料率（%） |
| `linkDisplayOrder` | number | - | 表示順。デフォルト `0` |
| `linkStartDate` | string (date) | - | 開始日 |
| `linkEndDate` | string (date) | - | 終了日 |
| `linkCustomData` | object | - | 事業固有の代理店情報 |

```json
{
  "businessId": 1,
  "linkHierarchyLevel": "1",
  "linkCommissionRate": 10.00,
  "linkStartDate": "2026-01-01"
}
```

#### レスポンス

**成功（201）**: 作成されたリンクデータを返却

**エラー（409）**: `(partnerId, businessId)`の組み合わせが既存の場合

---

### 3.14 PATCH /api/v1/partners/:id/business-links/:linkId

**説明**: 指定代理店の事業リンクを更新する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |
| `linkId` | number | リンクID |

**Body (JSON)**: `POST /api/v1/partners/:id/business-links` と同一フィールド（`businessId`を除く）

#### レスポンス

**成功（200）**: 更新後のリンクデータを返却

---

### 3.15 DELETE /api/v1/partners/:id/business-links/:linkId

**説明**: 指定代理店の事業リンクを物理削除する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 代理店ID |
| `linkId` | number | リンクID |

#### レスポンス

**成功（204 No Content）**: レスポンスボディなし

**特記事項**:
- 該当事業に紐づく案件が存在する場合は削除不可（`409 CONFLICT`）

---

### 3.16 GET /api/v1/partners/hierarchy

**説明**: 代理店の全社マスタ階層をツリー構造で取得する。

**認可**: `admin`, `staff`

#### リクエスト

**Query Parameters**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|----------|---|------|----------|------|
| `includeInactive` | boolean | - | `false` | 無効代理店を含めるか |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "partnerCode": "AG-0001",
      "partnerName": "代理店A株式会社",
      "partnerHierarchy": "1次代理店",
      "partnerIsActive": true,
      "children": [
        {
          "id": 2,
          "partnerCode": "AG-0002",
          "partnerName": "代理店B株式会社",
          "partnerHierarchy": "2次代理店",
          "partnerIsActive": true,
          "children": []
        }
      ]
    },
    {
      "id": 3,
      "partnerCode": "AG-0003",
      "partnerName": "代理店C株式会社",
      "partnerHierarchy": "1次代理店",
      "partnerIsActive": true,
      "children": []
    }
  ]
}
```

**特記事項**:
- ルートノード（`partnerParentId = null`）を起点にツリーを構築
- 各ノードに`children`配列を含める（再帰構造）

---

### 3.17 POST /api/v1/partners/batch/delete

**説明**: 複数の代理店を一括で論理削除する。

**認可**: `admin`

#### リクエスト

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `ids` | number[] | 必須 | 対象代理店IDの配列 |

```json
{
  "ids": [1, 2, 3]
}
```

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "deletedCount": 3,
    "skippedCount": 0,
    "skippedIds": []
  }
}
```

**特記事項**:
- 顧客の一括削除と同一の仕様

---

## 4. 事業定義 API

### 4.1 GET /api/v1/businesses

**説明**: 事業一覧を取得する。Phase 0で実装済みのエンドポイントをPhase 1で拡張。

**認可**: `admin`, `staff`, `partner_admin`, `partner_staff`

#### リクエスト

**Query Parameters**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|----------|---|------|----------|------|
| `includeInactive` | boolean | - | `false` | 無効事業を含めるか |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "businessCode": "moag",
      "businessName": "MOAG事業",
      "businessDescription": "MOAG関連の営業管理",
      "businessProjectPrefix": "MG",
      "businessIsActive": true,
      "businessSortOrder": 0,
      "statusDefinitionCount": 7,
      "movementTemplateCount": 18,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 2,
    "page": 1,
    "pageSize": 25,
    "totalPages": 1
  }
}
```

**特記事項**:
- `partner_admin` / `partner_staff` は自社が関与する事業のみ閲覧可能
- `statusDefinitionCount`、`movementTemplateCount`はリレーションの集計値

---

### 4.2 GET /api/v1/businesses/:id

**説明**: 指定IDの事業詳細を取得する。

**認可**: `admin`, `staff`, `partner_admin`（所属事業のみ）, `partner_staff`（所属事業のみ）

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "businessCode": "moag",
    "businessName": "MOAG事業",
    "businessDescription": "MOAG関連の営業管理",
    "businessConfig": {
      "projectFields": {
        "custom_field_1": {
          "label": "機械型番",
          "type": "text",
          "required": true
        }
      },
      "customerFields": {
        "custom_field_1": {
          "label": "設備規模",
          "type": "select",
          "options": ["小規模", "中規模", "大規模"],
          "required": false
        }
      },
      "partnerFields": {},
      "revenueRecognition": {
        "triggerStatus": "purchased",
        "amountField": "project_amount",
        "dateField": "project_actual_close_date"
      },
      "settings": {
        "enableGanttChart": true,
        "enableMonthlyReport": true
      }
    },
    "businessProjectPrefix": "MG",
    "businessIsActive": true,
    "businessSortOrder": 0,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "createdBy": 1,
    "updatedBy": 1
  }
}
```

---

### 4.3 POST /api/v1/businesses

**説明**: 新しい事業を作成する。

**認可**: `admin`

#### リクエスト

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `businessCode` | string | 必須 | 事業コード（UNIQUE）。20文字以内。英数字+アンダースコア |
| `businessName` | string | 必須 | 事業名。1〜100文字 |
| `businessDescription` | string | - | 事業説明 |
| `businessConfig` | object | - | 事業固有設定（JSON）。デフォルト `{}` |
| `businessProjectPrefix` | string | 必須 | 案件番号プレフィックス（UNIQUE）。10文字以内 |
| `businessSortOrder` | number | - | 表示順。デフォルト `0` |

```json
{
  "businessCode": "service_b",
  "businessName": "サービスB事業",
  "businessDescription": "サービスBの営業管理",
  "businessProjectPrefix": "SB",
  "businessConfig": {
    "projectFields": {},
    "customerFields": {},
    "partnerFields": {},
    "settings": {}
  },
  "businessSortOrder": 2
}
```

#### レスポンス

**成功（201）**: 作成された事業データを返却

**エラー（409）**:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "指定された事業コードまたはプレフィックスは既に使用されています"
  }
}
```

---

### 4.4 PATCH /api/v1/businesses/:id

**説明**: 指定IDの事業を更新する。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |

**Body (JSON)**: `POST /api/v1/businesses` と同一フィールド（変更するフィールドのみ）

**注意**: `businessCode`と`businessProjectPrefix`は作成後に変更不可。変更リクエストに含めた場合は無視する。

#### レスポンス

**成功（200）**: 更新後の事業データを返却

---

### 4.5 GET /api/v1/businesses/:id/status-definitions

**説明**: 指定事業の営業ステータス定義一覧を取得する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |

**Query Parameters**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|----------|---|------|----------|------|
| `includeInactive` | boolean | - | `false` | 無効なステータス定義を含めるか |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "businessId": 1,
      "statusCode": "lead",
      "statusLabel": "1.リード",
      "statusPriority": 10,
      "statusColor": "#6B7280",
      "statusIsFinal": false,
      "statusIsLost": false,
      "statusSortOrder": 0,
      "statusIsActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "businessId": 1,
      "statusCode": "proposal",
      "statusLabel": "2.提案中",
      "statusPriority": 20,
      "statusColor": "#3B82F6",
      "statusIsFinal": false,
      "statusIsLost": false,
      "statusSortOrder": 1,
      "statusIsActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

**特記事項**:
- `statusSortOrder`の昇順でソート

---

### 4.6 POST /api/v1/businesses/:id/status-definitions

**説明**: 指定事業に営業ステータス定義を追加する。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `statusCode` | string | 必須 | ステータスコード。50文字以内 |
| `statusLabel` | string | 必須 | 表示ラベル。100文字以内 |
| `statusPriority` | number | 必須 | 優先度（大きいほど高い） |
| `statusColor` | string | - | 表示色（HEXカラーコード） |
| `statusIsFinal` | boolean | - | 最終ステータスか。デフォルト`false` |
| `statusIsLost` | boolean | - | 失注ステータスか。デフォルト`false` |
| `statusSortOrder` | number | - | 表示順。デフォルト`0` |

```json
{
  "statusCode": "negotiation",
  "statusLabel": "3.商談中",
  "statusPriority": 30,
  "statusColor": "#F59E0B",
  "statusSortOrder": 2
}
```

#### レスポンス

**成功（201）**: 作成されたステータス定義を返却

**エラー（409）**:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "指定された事業に同じステータスコードが既に存在します"
  }
}
```

**特記事項**:
- `(businessId, statusCode)`の組み合わせにUNIQUE制約がある

---

### 4.7 PATCH /api/v1/businesses/:id/status-definitions/:statusId

**説明**: 指定事業の営業ステータス定義を更新する。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |
| `statusId` | number | ステータス定義ID |

**Body (JSON)**: POST と同一フィールド（変更するフィールドのみ）

**注意**: `statusCode`は作成後に変更不可（案件データが参照するため）。

#### レスポンス

**成功（200）**: 更新後のステータス定義を返却

---

### 4.8 DELETE /api/v1/businesses/:id/status-definitions/:statusId

**説明**: 指定事業の営業ステータス定義を論理削除する（`statusIsActive = false`に更新）。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |
| `statusId` | number | ステータス定義ID |

#### レスポンス

**成功（204 No Content）**: レスポンスボディなし

**特記事項**:
- 該当ステータスを使用中の案件が存在する場合は削除不可（`409 CONFLICT`）
- ステータス定義は論理削除（`statusIsActive = false`）

---

### 4.9 GET /api/v1/businesses/:id/movement-templates

**説明**: 指定事業のムーブメントテンプレート一覧を取得する。

**認可**: `admin`, `staff`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |

**Query Parameters**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|----------|---|------|----------|------|
| `includeInactive` | boolean | - | `false` | 無効なテンプレートを含めるか |

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "businessId": 1,
      "stepNumber": 1,
      "stepCode": "initial_contact",
      "stepName": "初回接触",
      "stepDescription": "顧客との初回コンタクト",
      "stepIsSalesLinked": false,
      "stepLinkedStatusCode": null,
      "stepConfig": {},
      "stepIsActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "businessId": 1,
      "stepNumber": 2,
      "stepCode": "needs_analysis",
      "stepName": "ニーズ分析",
      "stepDescription": "顧客要件のヒアリングと分析",
      "stepIsSalesLinked": true,
      "stepLinkedStatusCode": "proposal",
      "stepConfig": {},
      "stepIsActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

**特記事項**:
- `stepNumber`の昇順でソート

---

### 4.10 POST /api/v1/businesses/:id/movement-templates

**説明**: 指定事業にムーブメントテンプレートを追加する。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `stepNumber` | number | 必須 | ステップ番号（事業内でUNIQUE） |
| `stepCode` | string | 必須 | ステップコード。50文字以内 |
| `stepName` | string | 必須 | ステップ名。100文字以内 |
| `stepDescription` | string | - | ステップ説明 |
| `stepIsSalesLinked` | boolean | - | 営業ステータス連動か。デフォルト`false` |
| `stepLinkedStatusCode` | string | - | 連動するステータスコード |
| `stepConfig` | object | - | ステップ固有設定。デフォルト`{}` |

```json
{
  "stepNumber": 3,
  "stepCode": "proposal_creation",
  "stepName": "提案書作成",
  "stepDescription": "顧客向け提案書の作成",
  "stepIsSalesLinked": false
}
```

#### レスポンス

**成功（201）**: 作成されたテンプレートデータを返却

**エラー（409）**:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "指定された事業に同じステップ番号が既に存在します"
  }
}
```

**特記事項**:
- `(businessId, stepNumber)`の組み合わせにUNIQUE制約がある
- `stepIsSalesLinked = true`の場合、`stepLinkedStatusCode`は必須
- `stepLinkedStatusCode`は該当事業の`business_status_definitions`に存在するコードであること

---

### 4.11 PATCH /api/v1/businesses/:id/movement-templates/:templateId

**説明**: 指定事業のムーブメントテンプレートを更新する。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |
| `templateId` | number | テンプレートID |

**Body (JSON)**: POST と同一フィールド（変更するフィールドのみ）

#### レスポンス

**成功（200）**: 更新後のテンプレートデータを返却

---

### 4.12 DELETE /api/v1/businesses/:id/movement-templates/:templateId

**説明**: 指定事業のムーブメントテンプレートを論理削除する（`stepIsActive = false`に更新）。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |
| `templateId` | number | テンプレートID |

#### レスポンス

**成功（204 No Content）**: レスポンスボディなし

**特記事項**:
- 該当テンプレートを使用中の案件ムーブメントが存在する場合は削除不可（`409 CONFLICT`）

---

### 4.13 PATCH /api/v1/businesses/:id/movement-templates/reorder

**説明**: 指定事業のムーブメントテンプレートの表示順を一括変更する。

**認可**: `admin`

#### リクエスト

**Path Parameters**:

| パラメータ | 型 | 説明 |
|----------|---|------|
| `id` | number | 事業ID |

**Body (JSON)**:

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `order` | object[] | 必須 | テンプレートIDとステップ番号の配列 |
| `order[].id` | number | 必須 | テンプレートID |
| `order[].stepNumber` | number | 必須 | 新しいステップ番号 |

```json
{
  "order": [
    { "id": 3, "stepNumber": 1 },
    { "id": 1, "stepNumber": 2 },
    { "id": 2, "stepNumber": 3 }
  ]
}
```

#### レスポンス

**成功（200）**:

```json
{
  "success": true,
  "data": {
    "updatedCount": 3
  }
}
```

**特記事項**:
- トランザクション内で全てのステップ番号を一括更新する
- `stepNumber`の重複が発生しないよう、一時的に負の値に更新してから正の値に更新するなどの工夫が必要
- 指定された`id`が該当事業に属さない場合は`400 VALIDATION_ERROR`を返却

---

## 5. 運用監視・ログ

### 5.1 監査ログ

全CUD操作（作成・更新・削除）は以下の情報を記録する：

| フィールド | 型 | 説明 |
|---|---|---|
| action | string | create / update / delete |
| entityType | string | customer / partner / business |
| entityId | number | 操作対象のID |
| userId | number | 操作ユーザーID |
| changes | JSON | 変更前後の差分（updateの場合のみ） |
| ipAddress | string | リクエスト元IP |
| timestamp | datetime | 操作日時 |

**注意**: Phase 1では`created_by`/`updated_by`フィールドでの簡易記録とし、本格的な監査ログテーブルはPhase 2で実装する。

### 5.2 APIメトリクス

以下のメトリクスをサーバーログに記録する：

| メトリクス | 記録方法 | 用途 |
|---|---|---|
| レスポンスタイム | withApiAuth内で計測 | 性能劣化の検出 |
| HTTPステータス | APIレスポンス毎 | エラー率の監視 |
| リクエスト数 | エンドポイント毎 | 負荷傾向の把握 |
| エラースタックトレース | 5xxエラー発生時 | 障害調査 |

**ログフォーマット（構造化JSON）**:

```json
{
  "timestamp": "2026-02-21T10:30:00Z",
  "level": "info",
  "method": "GET",
  "path": "/api/v1/customers",
  "status": 200,
  "duration_ms": 145,
  "user_id": 1,
  "business_id": 1,
  "query_params": {"page": 1, "pageSize": 25}
}
```

### 5.3 ヘルスチェック拡張

`GET /api/v1/health` のレスポンスを拡張：

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-21T10:30:00Z",
    "database": {
      "status": "connected",
      "latency_ms": 5
    },
    "version": "1.0.0",
    "uptime_seconds": 86400
  }
}
```

---

## 付録

### A. エンドポイント一覧

| # | メソッド | パス | 説明 | 認可 |
|---|--------|-----|------|------|
| 2.1 | GET | `/api/v1/customers` | 顧客一覧 | all |
| 2.2 | POST | `/api/v1/customers` | 顧客作成 | admin, staff |
| 2.3 | GET | `/api/v1/customers/:id` | 顧客詳細 | all |
| 2.4 | PATCH | `/api/v1/customers/:id` | 顧客更新 | admin, staff |
| 2.5 | DELETE | `/api/v1/customers/:id` | 顧客論理削除 | admin |
| 2.6 | PATCH | `/api/v1/customers/:id/restore` | 顧客復元 | admin |
| 2.7 | GET | `/api/v1/customers/filter-options` | フィルター選択肢 | all |
| 2.8 | GET | `/api/v1/customers/:id/contacts` | 担当者一覧 | all |
| 2.9 | POST | `/api/v1/customers/:id/contacts` | 担当者作成 | admin, staff |
| 2.10 | PATCH | `/api/v1/customers/:id/contacts/:contactId` | 担当者更新 | admin, staff |
| 2.11 | DELETE | `/api/v1/customers/:id/contacts/:contactId` | 担当者削除 | admin, staff |
| 2.12 | GET | `/api/v1/customers/:id/business-links` | 事業リンク一覧 | all |
| 2.13 | POST | `/api/v1/customers/:id/business-links` | 事業リンク作成 | admin, staff |
| 2.14 | PATCH | `/api/v1/customers/:id/business-links/:linkId` | 事業リンク更新 | admin, staff |
| 2.15 | DELETE | `/api/v1/customers/:id/business-links/:linkId` | 事業リンク削除 | admin, staff |
| 2.16 | POST | `/api/v1/customers/batch/delete` | 一括論理削除 | admin |
| 3.1 | GET | `/api/v1/partners` | 代理店一覧 | all |
| 3.2 | POST | `/api/v1/partners` | 代理店作成 | admin, staff |
| 3.3 | GET | `/api/v1/partners/:id` | 代理店詳細 | all |
| 3.4 | PATCH | `/api/v1/partners/:id` | 代理店更新 | admin, staff |
| 3.5 | DELETE | `/api/v1/partners/:id` | 代理店論理削除 | admin |
| 3.6 | PATCH | `/api/v1/partners/:id/restore` | 代理店復元 | admin |
| 3.7 | GET | `/api/v1/partners/filter-options` | フィルター選択肢 | all |
| 3.8 | GET | `/api/v1/partners/:id/contacts` | 担当者一覧 | all |
| 3.9 | POST | `/api/v1/partners/:id/contacts` | 担当者作成 | admin, staff, partner_admin |
| 3.10 | PATCH | `/api/v1/partners/:id/contacts/:contactId` | 担当者更新 | admin, staff, partner_admin |
| 3.11 | DELETE | `/api/v1/partners/:id/contacts/:contactId` | 担当者削除 | admin, staff, partner_admin |
| 3.12 | GET | `/api/v1/partners/:id/business-links` | 事業リンク一覧 | all |
| 3.13 | POST | `/api/v1/partners/:id/business-links` | 事業リンク作成 | admin, staff |
| 3.14 | PATCH | `/api/v1/partners/:id/business-links/:linkId` | 事業リンク更新 | admin, staff |
| 3.15 | DELETE | `/api/v1/partners/:id/business-links/:linkId` | 事業リンク削除 | admin, staff |
| 3.16 | GET | `/api/v1/partners/hierarchy` | 階層ツリー取得 | admin, staff |
| 3.17 | POST | `/api/v1/partners/batch/delete` | 一括論理削除 | admin |
| 4.1 | GET | `/api/v1/businesses` | 事業一覧 | all |
| 4.2 | GET | `/api/v1/businesses/:id` | 事業詳細 | all |
| 4.3 | POST | `/api/v1/businesses` | 事業作成 | admin |
| 4.4 | PATCH | `/api/v1/businesses/:id` | 事業更新 | admin |
| 4.5 | GET | `/api/v1/businesses/:id/status-definitions` | ステータス定義一覧 | admin, staff |
| 4.6 | POST | `/api/v1/businesses/:id/status-definitions` | ステータス定義作成 | admin |
| 4.7 | PATCH | `/api/v1/businesses/:id/status-definitions/:statusId` | ステータス定義更新 | admin |
| 4.8 | DELETE | `/api/v1/businesses/:id/status-definitions/:statusId` | ステータス定義削除 | admin |
| 4.9 | GET | `/api/v1/businesses/:id/movement-templates` | テンプレート一覧 | admin, staff |
| 4.10 | POST | `/api/v1/businesses/:id/movement-templates` | テンプレート作成 | admin |
| 4.11 | PATCH | `/api/v1/businesses/:id/movement-templates/:templateId` | テンプレート更新 | admin |
| 4.12 | DELETE | `/api/v1/businesses/:id/movement-templates/:templateId` | テンプレート削除 | admin |
| 4.13 | PATCH | `/api/v1/businesses/:id/movement-templates/reorder` | テンプレート順序変更 | admin |

| 5.1 | GET | `/api/v1/user-preferences/table?tableKey=xxx` | ユーザーテーブル列設定取得 | all |
| 5.2 | PUT | `/api/v1/user-preferences/table` | ユーザーテーブル列設定保存 | all |

**認可の凡例**: `all` = `admin`, `staff`, `partner_admin`, `partner_staff`（ただし代理店ロールはスコープ制限あり）

---

## 5. ユーザー設定 API

### 5.1 テーブル列設定 取得

`GET /api/v1/user-preferences/table?tableKey=customer-list`

**クエリパラメータ:**
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `tableKey` | string | ✅ | テーブル識別キー（例: `"customer-list"`） |

**レスポンス（200 OK）:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "userId": 1,
    "tableKey": "customer-list",
    "settings": {
      "columnOrder": ["customerCode", "customerName", "customerType"],
      "columnVisibility": { "customerCode": true, "customerFax": false },
      "columnWidths": { "customerCode": 120, "customerName": 200 },
      "sortState": [{ "field": "customerCode", "direction": "asc" }],
      "columnPinning": { "left": ["customerName"] }
    },
    "createdAt": "2026-02-21T00:00:00.000Z",
    "updatedAt": "2026-02-21T00:00:00.000Z"
  }
}
```

> `data` が `null` の場合は設定未保存（デフォルト値を使用）。

### 5.2 テーブル列設定 保存

`PUT /api/v1/user-preferences/table`

**リクエストボディ:**
```json
{
  "tableKey": "customer-list",
  "settings": {
    "columnOrder": ["customerCode", "customerName", "customerType"],
    "columnVisibility": { "customerCode": true, "customerFax": false },
    "columnWidths": { "customerCode": 120, "customerName": 200 },
    "sortState": [{ "field": "customerCode", "direction": "asc" }]
  }
}
```

**処理:**
- `@@unique([userId, tableKey])` で upsert（存在しなければ作成、あれば更新）
- `userId` はセッションから取得（リクエストボディに含めない）

**レスポンス（200 OK）:** 保存された設定オブジェクト（5.1と同じ構造）
