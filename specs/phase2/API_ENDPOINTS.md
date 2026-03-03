# Phase 2: API仕様書

> **前提ドキュメント**: 本書は以下に準拠する。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [06_PHASE2_PRD.md](../06_PHASE2_PRD.md) | Phase 2 全体PRD |
> | [phase1/API_ENDPOINTS.md](../phase1/API_ENDPOINTS.md) | Phase 1 API仕様（共通仕様） |
> | [PROJECT_DESIGN.md](./PROJECT_DESIGN.md) | 案件マスタ設計 |
> | [BUSINESS_TABS_DESIGN.md](./BUSINESS_TABS_DESIGN.md) | 事業詳細タブ設計 |

---

## 目次

1. [共通仕様（再掲）](#1-共通仕様再掲)
2. [案件 API](#2-案件-api)
3. [営業ステータス定義 API](#3-営業ステータス定義-api)
4. [ムーブメントテンプレート API](#4-ムーブメントテンプレート-api)
5. [関連案件 API](#5-関連案件-api)

---

## 1. 共通仕様（再掲）

Phase 1 API仕様書の共通仕様を継承する。

### レスポンス形式

```json
// 成功（単一）
{ "success": true, "data": { ... } }

// 成功（一覧）
{ "success": true, "data": [...], "count": 100 }

// エラー
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容にエラーがあります",
    "details": [{ "field": "customerId", "message": "顧客を選択してください" }]
  }
}
```

### 認証

全APIエンドポイントは認証必須。`getServerSession(authOptions)` で認証チェック。

---

## 2. 案件 API

### 2.1 案件一覧

```
GET /api/v1/projects
```

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `page` | number | - | ページ番号（デフォルト: 1） |
| `pageSize` | number | - | 1ページの件数（デフォルト: 25） |
| `search` | string | - | テキスト検索（案件番号・顧客名・代理店名・担当者名） |
| `sort` | string | - | ソート指定（例: `updatedAt:desc,projectNo:asc`） |
| `businessId` | number | - | 事業ID（事業セレクター連動） |
| `filter[projectSalesStatus]` | string | - | ステータスフィルター（カンマ区切り） |
| `filter[projectAssignedUserId]` | string | - | 担当ユーザーフィルター（アクセス制御用） |
| `filter[projectExpectedCloseMonth]` | string | - | 受注予定月フィルター |

**レスポンス:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "projectNo": "MG-0001",
      "businessId": 1,
      "customerId": 1,
      "partnerId": 2,
      "projectSalesStatus": "b_yomi",
      "projectExpectedCloseMonth": "2026-06",
      "projectAssignedUserId": 2,
      "projectAssignedUserName": "田中太郎",
      "projectNotes": null,
      "projectCustomData": { "project_amount": 5000000 },
      "projectIsActive": true,
      "version": 1,
      "createdAt": "2026-02-24T10:00:00.000Z",
      "updatedAt": "2026-02-24T10:00:00.000Z",
      "customer": {
        "id": 1,
        "customerCode": "CST-0001",
        "customerName": "株式会社サンプル"
      },
      "partner": {
        "id": 2,
        "partnerCode": "AG-0001",
        "partnerName": "代理店A"
      },
      "business": {
        "id": 1,
        "businessName": "MOAG事業"
      },
      "assignedUser": {
        "id": 2,
        "userName": "田中太郎"
      }
    }
  ],
  "count": 50
}
```

**権限制御:**
- `admin`: 全事業の案件
- `staff`: `user_business_assignments` でアサインされた事業の案件
- `partner_admin` / `partner_staff`: 自社+下位代理店の案件（`partner_id` でフィルター）

**Prisma include:**
```typescript
const include = {
  customer: { select: { id: true, customerCode: true, customerName: true } },
  partner: { select: { id: true, partnerCode: true, partnerName: true } },
  business: { select: { id: true, businessName: true } },
  assignedUser: { select: { id: true, userName: true } },
};
```

---

### 2.2 案件詳細

```
GET /api/v1/projects/:id
```

**レスポンス:**

一覧のレスポンスと同じ構造。ステータス定義の色情報も付加する。

```json
{
  "success": true,
  "data": {
    "id": 1,
    "projectNo": "MG-0001",
    "projectSalesStatus": "b_yomi",
    "projectSalesStatusLabel": "5.Bヨミ",
    "projectSalesStatusColor": "#f97316",
    "projectCustomData": { "project_amount": 5000000, "project_name": "A社向け提案" },
    "customer": { ... },
    "partner": { ... },
    "business": { ... },
    "assignedUser": { ... },
    ...
  }
}
```

---

### 2.3 案件作成

```
POST /api/v1/projects
```

**リクエスト:**

```json
{
  "businessId": 1,
  "customerId": 1,
  "partnerId": 2,
  "projectSalesStatus": "appointing",
  "projectExpectedCloseMonth": "2026-06",
  "projectAssignedUserId": 2,
  "projectAssignedUserName": "田中太郎",
  "projectNotes": "初回提案予定",
  "projectCustomData": {
    "project_amount": 5000000,
    "project_name": "A社向け提案"
  }
}
```

**処理フロー:**

1. バリデーション（共通項目 + 事業固有項目）
2. `businessId` の存在確認 + アクティブチェック
3. `customerId` の存在確認
4. `partnerId` の存在確認（指定時のみ）
5. `projectSalesStatus` が事業のステータス定義に存在するか確認
6. `$transaction` 内で:
   a. 案件番号の自動採番（`generateProjectNo()`）
   b. 案件レコード作成
   c. ムーブメントレコードの自動生成（`createInitialMovements()`）
7. 作成結果を返却

**レスポンス:** `201 Created`

```json
{
  "success": true,
  "data": { "id": 1, "projectNo": "MG-0001", ... }
}
```

---

### 2.4 案件更新

```
PATCH /api/v1/projects/:id
```

**リクエスト:**

```json
{
  "projectSalesStatus": "a_yomi",
  "projectExpectedCloseMonth": "2026-07",
  "projectCustomData": { "project_amount": 6000000 },
  "version": 1
}
```

**処理:**

- 楽観的ロック（`version` チェック → 409 Conflict）
- `businessId` は変更不可（編集時は `disabledOnEdit`）
- `projectSalesStatus` 変更時は `projectStatusChangedAt` を更新
- `projectCustomData` はディープマージ（送信されたキーのみ更新、既存キーは保持）
- Phase 2 ではステータス遷移制御なし（自由変更）

**projectCustomData のディープマージ:**

```typescript
// API側の処理
const existingCustomData = existingProject.projectCustomData as Record<string, unknown>;
const newCustomData = body.projectCustomData as Record<string, unknown>;
const mergedCustomData = { ...existingCustomData, ...newCustomData };
```

---

### 2.5 案件論理削除

```
DELETE /api/v1/projects/:id
```

**処理:**
- `projectIsActive = false` に更新
- ムーブメントは連鎖削除しない

---

### 2.6 案件復元

```
PATCH /api/v1/projects/:id/restore
```

**処理:**
- `projectIsActive = true` に更新
- `admin` ロールのみ実行可

---

### 2.7 案件一括操作

```
POST /api/v1/projects/batch
```

**リクエスト:**

```json
{
  "action": "delete",
  "ids": [1, 3, 5]
}
```

**レスポンス:**

```json
{
  "success": true,
  "data": { "affected": 3, "requested": 3 }
}
```

---

### 2.8 案件CSVエクスポート

```
GET /api/v1/projects/csv
```

**クエリパラメータ:**
- 一覧APIと同じフィルターパラメータ
- `columns`: エクスポート対象列（カンマ区切り）

**レスポンス:** CSV ファイル（Content-Type: text/csv）

事業固有フィールドは `projectCustomData` から展開して列に追加する。

---

### 2.9 案件CSVインポート

```
POST /api/v1/projects/csv
```

**リクエスト:** `multipart/form-data`
- `file`: CSVファイル
- `businessId`: 対象事業ID（必須）

**処理:**
1. CSVパース（UTF-8 / Shift-JIS 自動判定）
2. ヘッダーマッピング（日本語ラベル → フィールドキー）
3. 顧客コード → `customerId` の名寄せ
4. 代理店コード → `partnerId` の名寄せ（空欄はNULL）
5. 営業ステータスコードのバリデーション
6. 事業固有フィールドを `projectCustomData` にマッピング
7. 各行のバリデーション
8. 一括作成

---

## 3. 営業ステータス定義 API

### 3.1 一覧取得

```
GET /api/v1/businesses/:businessId/status-definitions
```

**レスポンス:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "businessId": 1,
      "statusCode": "purchased",
      "statusLabel": "1.購入済み",
      "statusPriority": 6,
      "statusColor": "#22c55e",
      "statusIsFinal": true,
      "statusIsLost": false,
      "statusSortOrder": 0,
      "statusIsActive": true
    }
  ]
}
```

### 3.2 新規追加

```
POST /api/v1/businesses/:businessId/status-definitions
```

**リクエスト:**

```json
{
  "statusCode": "new_status",
  "statusLabel": "新ステータス",
  "statusPriority": 3,
  "statusColor": "#8b5cf6",
  "statusIsFinal": false,
  "statusIsLost": false
}
```

**処理:**
- `statusCode` の事業内一意チェック
- `statusSortOrder` は既存最大値 +1 を自動設定
- `statusIsFinal = true` の場合、他の `statusIsFinal` を `$transaction` 内で `false` に更新
- `statusIsLost = true` の場合も同様

### 3.3 更新

```
PATCH /api/v1/businesses/:businessId/status-definitions/:id
```

**リクエスト:**

```json
{
  "statusLabel": "更新後ラベル",
  "statusPriority": 5,
  "statusColor": "#3b82f6"
}
```

**注意:** `statusCode` は更新不可。リクエストに含まれても無視する。

### 3.4 削除

```
DELETE /api/v1/businesses/:businessId/status-definitions/:id
```

**制約:** そのステータスを使用中の案件が存在する場合は削除不可（400エラー）。

### 3.5 並び替え

```
PATCH /api/v1/businesses/:businessId/status-definitions/reorder
```

**リクエスト:**

```json
{
  "orderedIds": [3, 1, 5, 2, 4, 7, 6]
}
```

**処理:** 配列のインデックスを `statusSortOrder` として一括更新。

---

## 4. ムーブメントテンプレート API

### 4.1 一覧取得

```
GET /api/v1/businesses/:businessId/movement-templates
```

### 4.2 新規追加

```
POST /api/v1/businesses/:businessId/movement-templates
```

**リクエスト:**

```json
{
  "stepCode": "new_step",
  "stepName": "新ステップ",
  "stepDescription": "ステップの説明",
  "stepIsSalesLinked": false,
  "stepLinkedStatusCode": null
}
```

**処理:**
- `stepCode` の事業内一意チェック
- `stepNumber` は既存最大値 +1 を自動設定
- `stepIsSalesLinked = true` の場合、`stepLinkedStatusCode` が同事業のステータス定義に存在するか確認

### 4.3 更新

```
PATCH /api/v1/businesses/:businessId/movement-templates/:id
```

**注意:** `stepCode` は更新不可。

### 4.4 削除

```
DELETE /api/v1/businesses/:businessId/movement-templates/:id
```

**制約:** 削除後、残りのテンプレートの `stepNumber` を連番に再計算する。

### 4.5 並び替え

```
PATCH /api/v1/businesses/:businessId/movement-templates/reorder
```

**リクエスト:**

```json
{
  "orderedIds": [1, 3, 2, 5, 4]
}
```

**処理:** 配列のインデックス +1 を `stepNumber` として一括更新。

---

## 5. 関連案件 API

### 5.1 顧客の関連案件

```
GET /api/v1/customers/:customerId/projects
```

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `page` | number | - | ページ番号 |
| `pageSize` | number | - | 件数 |

**レスポンス:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "projectNo": "MG-0001",
      "projectSalesStatus": "b_yomi",
      "projectExpectedCloseMonth": "2026-06",
      "projectAssignedUserName": "田中太郎",
      "business": { "businessName": "MOAG事業" },
      "assignedUser": { "userName": "田中太郎" },
      "statusDefinition": {
        "statusLabel": "5.Bヨミ",
        "statusColor": "#f97316"
      }
    }
  ],
  "count": 5
}
```

**Prisma where:**
```typescript
{
  customerId: parseInt(customerId),
  projectIsActive: true,
}
```

### 5.2 代理店の関連案件

```
GET /api/v1/partners/:partnerId/projects
```

仕様は顧客の関連案件と同様。`partnerId` でフィルター。
