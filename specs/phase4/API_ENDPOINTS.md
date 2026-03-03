# Phase 4: API エンドポイント仕様

> **前提ドキュメント**: 本書は以下に準拠する。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [08_PHASE4_PRD.md](../08_PHASE4_PRD.md) | Phase 4 全体PRD |
> | [SALES_TARGET_DESIGN.md](./SALES_TARGET_DESIGN.md) | 売上目標・計上ルール設計 |
> | [DASHBOARD_DESIGN.md](./DASHBOARD_DESIGN.md) | ダッシュボード設計 |
> | [PORTAL_DESIGN.md](./PORTAL_DESIGN.md) | 代理店ポータル設計 |

---

## 1. 売上目標 API

### 1.1 GET `/api/v1/businesses/:id/sales-targets`

年度の売上目標 + 実績を取得する。

**認証**: 必須（admin / staff）

**パスパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | number | ○ | 事業ID |

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `year` | number | ○ | 年度開始年（例: 2025 → 2025-04〜2026-03） |

**レスポンス（200）:**

```json
{
  "success": true,
  "data": {
    "businessId": 1,
    "year": 2025,
    "revenueRecognition": {
      "statusCode": "purchased",
      "amountField": "proposed_amount",
      "dateField": "projectExpectedCloseMonth"
    },
    "months": [
      {
        "month": "2025-04",
        "targetAmount": 10000000,
        "actualAmount": 8500000,
        "achievementRate": 85.0,
        "projectCount": 12
      },
      {
        "month": "2025-05",
        "targetAmount": 12000000,
        "actualAmount": 13200000,
        "achievementRate": 110.0,
        "projectCount": 15
      }
    ],
    "yearTotal": {
      "targetAmount": 144000000,
      "actualAmount": 21700000,
      "achievementRate": 15.1,
      "projectCount": 27
    }
  }
}
```

**注意:**
- `revenueRecognition` が null の場合、`actualAmount` は全て 0、`achievementRate` は null
- `targetAmount` が 0 の月は `achievementRate` = null

---

### 1.2 PUT `/api/v1/businesses/:id/sales-targets`

年度の売上目標を一括保存する。

**認証**: 必須（admin のみ）

**パスパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | number | ○ | 事業ID |

**リクエストボディ:**

```json
{
  "year": 2025,
  "targets": [
    { "month": "2025-04", "targetAmount": 10000000 },
    { "month": "2025-05", "targetAmount": 12000000 },
    { "month": "2025-06", "targetAmount": 15000000 },
    { "month": "2025-07", "targetAmount": 15000000 },
    { "month": "2025-08", "targetAmount": 12000000 },
    { "month": "2025-09", "targetAmount": 10000000 },
    { "month": "2025-10", "targetAmount": 12000000 },
    { "month": "2025-11", "targetAmount": 15000000 },
    { "month": "2025-12", "targetAmount": 15000000 },
    { "month": "2026-01", "targetAmount": 10000000 },
    { "month": "2026-02", "targetAmount": 10000000 },
    { "month": "2026-03", "targetAmount": 8000000 }
  ]
}
```

**バリデーション:**
- `year`: 2020〜2100
- `targets`: 配列長 = 12
- `targets[].month`: `YYYY-MM` 形式
- `targets[].targetAmount`: 0 以上

**処理:**
- `targetAmount === 0` の月は既存レコードを削除
- `targetAmount > 0` の月は upsert（`businessId` + `targetMonth` で一意）
- トランザクション内で実行

**レスポンス（200）:**

```json
{
  "success": true,
  "data": {
    "savedCount": 10,
    "deletedCount": 2
  }
}
```

**エラー:**
- 403: admin 以外
- 404: 事業が存在しない

---

## 2. ダッシュボード API

### 2.1 GET `/api/v1/dashboard/summary`

KPIサマリーを取得する。

**認証**: 必須（admin / staff）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `businessId` | number | × | 事業ID（省略 = 全社） |
| `month` | string | × | 対象月 `YYYY-MM`（省略 = 当月） |

**レスポンス（200）:**

```json
{
  "success": true,
  "data": {
    "currentMonth": "2025-04",
    "revenue": {
      "current": 21700000,
      "previous": 19400000,
      "changeRate": 11.9,
      "changeType": "positive"
    },
    "achievementRate": {
      "current": 85.0,
      "previous": 88.0,
      "changePoints": -3.0,
      "changeType": "negative"
    },
    "totalProjects": {
      "current": 156,
      "previous": 144,
      "change": 12,
      "changeType": "positive"
    },
    "wonProjects": {
      "current": 42,
      "previous": 37,
      "change": 5,
      "changeType": "positive"
    },
    "businessSummaries": [
      {
        "businessId": 1,
        "businessName": "MOAG事業",
        "actualAmount": 15000000,
        "targetAmount": 20000000,
        "achievementRate": 75.0,
        "projectCount": 98
      }
    ]
  }
}
```

**スコープ制御:**
- admin: 全事業
- staff: アサイン済み事業のみ（`UserBusinessAssignment` で絞り込み）
- `businessId` 指定時: staff は自分がアサインされた事業のみアクセス可能

**計算ロジック:**
- `revenue.current`: 対象月の全事業（or 指定事業）の売上実績合計
- `revenue.previous`: 前月の売上実績合計
- `achievementRate`: `revenue.current / Σ(targetAmount)` × 100
- `totalProjects`: `isActive = true` の案件総数
- `wonProjects`: 対象月に `isFinalStatus = true` になった案件数
- `businessSummaries`: 全社モード時のみ返す。事業別モードでは省略

---

### 2.2 GET `/api/v1/dashboard/revenue-trend`

月別の売上推移（目標+実績）を取得する。

**認証**: 必須（admin / staff）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `businessId` | number | × | 事業ID（省略 = 全社） |
| `year` | number | ○ | 年度開始年 |

**レスポンス（200）:**

```json
{
  "success": true,
  "data": {
    "year": 2025,
    "months": [
      {
        "month": "2025-04",
        "monthLabel": "4月",
        "targetAmount": 10000000,
        "actualAmount": 8500000
      },
      {
        "month": "2025-05",
        "monthLabel": "5月",
        "targetAmount": 12000000,
        "actualAmount": 13200000
      }
    ]
  }
}
```

**計算ロジック:**
- 全社モード: 各事業の計上ルールで集計した実績を合算 + 各事業の目標を合算
- 事業別モード: 指定事業の計上ルールで集計

---

### 2.3 GET `/api/v1/dashboard/pipeline`

パイプライン（ステータス別件数・金額）を取得する。

**認証**: 必須（admin / staff）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `businessId` | number | × | 事業ID（省略 = 全社） |

**レスポンス（200）:**

```json
{
  "success": true,
  "data": {
    "statuses": [
      {
        "statusCode": "negotiating",
        "statusLabel": "商談中",
        "statusColor": "#3b82f6",
        "statusSortOrder": 1,
        "projectCount": 45,
        "totalAmount": 32000000
      },
      {
        "statusCode": "proposed",
        "statusLabel": "提案中",
        "statusColor": "#f59e0b",
        "statusSortOrder": 2,
        "projectCount": 28,
        "totalAmount": 18000000
      }
    ],
    "total": {
      "projectCount": 156,
      "totalAmount": 85000000
    }
  }
}
```

**計算ロジック:**
- `isActive = true` の案件をステータス別にグルーピング
- `totalAmount`: 各事業の `revenueRecognition.amountField` で金額集計
- 全社モード: 全事業のステータスを統合（同名ステータスは合算）
- 事業別モード: 指定事業のステータス定義順で表示
- ステータス定義の `statusSortOrder` でソート

---

### 2.4 GET `/api/v1/dashboard/partner-ranking`

代理店別の売上ランキングを取得する。

**認証**: 必須（admin / staff）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `businessId` | number | ○ | 事業ID（必須。全社モードでは使用しない） |
| `limit` | number | × | 件数（デフォルト: 10） |

**レスポンス（200）:**

```json
{
  "success": true,
  "data": {
    "rankings": [
      {
        "rank": 1,
        "partnerId": 3,
        "partnerName": "ABC代理店",
        "totalAmount": 8000000,
        "projectCount": 5
      },
      {
        "rank": 2,
        "partnerId": 5,
        "partnerName": "DEF代理店",
        "totalAmount": 5000000,
        "projectCount": 3
      },
      {
        "rank": 3,
        "partnerId": null,
        "partnerName": "直販",
        "totalAmount": 2000000,
        "projectCount": 4
      }
    ]
  }
}
```

**計算ロジック:**
- 指定事業の受注案件（計上ステータス）の代理店別金額集計
- `partnerId IS NULL` = 直販
- 金額の降順でランキング

---

### 2.5 GET `/api/v1/dashboard/activity`

直近のアクティビティを取得する。

**認証**: 必須（admin / staff）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `businessId` | number | × | 事業ID（省略 = 全社） |
| `limit` | number | × | 件数（デフォルト: 20） |

**レスポンス（200）:**

```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": 1,
        "type": "status_change",
        "projectId": 42,
        "projectNo": "MG-0042",
        "customerName": "ABC商事",
        "description": "ステータス変更: 商談中 → 受注済み",
        "timestamp": "2025-04-15T10:30:00Z",
        "userName": "田中太郎"
      },
      {
        "id": 2,
        "type": "created",
        "projectId": 48,
        "projectNo": "MG-0048",
        "customerName": "GHI工業",
        "description": "新規作成",
        "timestamp": "2025-04-15T08:15:00Z",
        "userName": "佐藤花子"
      }
    ]
  }
}
```

**実装方針:**
- `projects` テーブルの `updatedAt` 降順で取得
- `type` の判定:
  - `createdAt === updatedAt` → `created`
  - `projectSalesStatus` が変更された場合 → `status_change`
  - その他 → `updated`
- ステータス変更の検出: 直接的な変更履歴テーブルがないため、`updatedAt` 近傍の案件を取得し、現在のステータスを表示する簡易版で実装
- 将来的に変更履歴テーブルを追加した際にリッチ化可能

---

## 3. 代理店ポータル API

### 3.1 GET `/api/v1/portal/summary`

代理店の事業別サマリーを取得する。

**認証**: 必須（partner_admin / partner_staff）

**レスポンス（200）:**

```json
{
  "success": true,
  "data": {
    "businesses": [
      {
        "businessId": 1,
        "businessName": "MOAG事業",
        "totalAmount": 8000000,
        "projectCount": 5,
        "wonProjectCount": 3
      },
      {
        "businessId": 2,
        "businessName": "SA事業",
        "totalAmount": 3000000,
        "projectCount": 2,
        "wonProjectCount": 1
      }
    ],
    "totals": {
      "totalAmount": 11000000,
      "projectCount": 7,
      "wonProjectCount": 4
    }
  }
}
```

**スコープ:**
- partner_admin: 自社+下位代理店の案件
- partner_staff: アサイン済み案件のみ

---

### 3.2 GET `/api/v1/portal/pipeline`

代理店のパイプラインを取得する。

**認証**: 必須（partner_admin / partner_staff）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `businessId` | number | × | 事業ID（省略 = 全事業） |

**レスポンス:**

`/dashboard/pipeline` と同じ形式。スコープが代理店に限定される。

---

### 3.3 GET `/api/v1/portal/projects`

代理店の案件一覧を取得する。

**認証**: 必須（partner_admin / partner_staff）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `businessId` | number | × | 事業ID（省略 = 全事業） |
| `page` | number | × | ページ番号（デフォルト: 1） |
| `pageSize` | number | × | 件数（デフォルト: 20） |
| `sortBy` | string | × | ソートフィールド |
| `sortOrder` | string | × | asc / desc |

**レスポンス（200）:**

```json
{
  "success": true,
  "data": [
    {
      "projectId": 1,
      "projectNo": "MG-0001",
      "customerName": "ABC商事",
      "businessName": "MOAG事業",
      "projectSalesStatus": "purchased",
      "projectSalesStatusLabel": "受注済み",
      "projectSalesStatusColor": "#22c55e",
      "projectExpectedCloseMonth": "2025-04",
      "amount": 5000000,
      "projectAssignedUserName": "田中太郎",
      "updatedAt": "2025-04-15T10:30:00Z"
    }
  ],
  "meta": {
    "total": 7,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

**ソート可能フィールド:**
- `projectNo`, `customerName`, `businessName`, `projectSalesStatus`, `projectExpectedCloseMonth`, `amount`, `updatedAt`

---

## 4. 共通仕様

### 4.1 エラーレスポンス

全APIで共通のエラー形式:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "認証が必要です"
  }
}
```

| コード | HTTP | 説明 |
|--------|------|------|
| `UNAUTHORIZED` | 401 | 未認証 |
| `FORBIDDEN` | 403 | 権限不足 |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `VALIDATION_ERROR` | 400 | バリデーションエラー |

### 4.2 年度の定義

- 年度開始月: 4月
- `year = 2025` → 2025-04 〜 2026-03 の12ヶ月

```typescript
function getFiscalYearMonths(year: number): string[] {
  // ["2025-04", "2025-05", ..., "2026-02", "2026-03"]
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 4;
    const y = month > 12 ? year + 1 : year;
    const m = month > 12 ? month - 12 : month;
    return `${y}-${String(m).padStart(2, '0')}`;
  });
}

function getCurrentFiscalYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}
```

### 4.3 金額の扱い

- DB: `Decimal(15, 2)` → API レスポンス: `number`（小数点以下は切り捨て）
- `projectCustomData` 内の金額: `number` 型で保存されている前提
- 未設定の金額: `0` として扱う
