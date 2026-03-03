# Phase 4: 売上目標・計上ルール詳細設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [08_PHASE4_PRD.md](../08_PHASE4_PRD.md) | Phase 4 全体PRD |
> | [01_DATA_MODEL.md](../01_DATA_MODEL.md) | テーブル定義、命名規則 |

---

## 目次

1. [実装概要](#1-実装概要)
2. [Prismaスキーマ](#2-prismaスキーマ)
3. [売上計上ルール](#3-売上計上ルール)
4. [売上目標API](#4-売上目標api)
5. [売上実績集計ロジック](#5-売上実績集計ロジック)
6. [売上目標タブUI](#6-売上目標タブui)
7. [計上ルール設定UI](#7-計上ルール設定ui)
8. [バリデーション](#8-バリデーション)
9. [実装チェックリスト](#9-実装チェックリスト)

---

## 1. 実装概要

### 1.1 機能スコープ

| 機能 | 説明 |
|------|------|
| SalesTarget モデル | 事業×月の売上目標テーブル |
| 売上計上ルール | businessConfig.revenueRecognition の設定 |
| 売上目標 API | 年度の目標取得・一括保存 |
| 売上実績集計 | 計上ルールに基づく自動集計 |
| 売上目標タブ | 事業詳細に年度別の目標設定UI |
| 計上ルール設定 | 事業詳細の設定タブに追加 |

---

## 2. Prismaスキーマ

### 2.1 SalesTarget モデル（新規追加）

```prisma
model SalesTarget {
  id            Int      @id @default(autoincrement())
  businessId    Int      @map("business_id")
  targetMonth   String   @map("target_month") @db.VarChar(7)  // YYYY-MM
  targetAmount  Decimal  @map("target_amount") @db.Decimal(15, 2)
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  createdBy     Int      @map("created_by")
  updatedBy     Int      @map("updated_by")

  business      Business @relation(fields: [businessId], references: [id])
  creator       User     @relation("SalesTargetCreator", fields: [createdBy], references: [id])
  updater       User     @relation("SalesTargetUpdater", fields: [updatedBy], references: [id])

  @@unique([businessId, targetMonth])
  @@map("sales_targets")
}
```

### 2.2 Business モデルへのリレーション追加

```prisma
model Business {
  // 既存フィールド...

  // 追加
  salesTargets  SalesTarget[]
}
```

### 2.3 User モデルへのリレーション追加

```prisma
model User {
  // 既存フィールド...

  // 追加
  createdSalesTargets  SalesTarget[] @relation("SalesTargetCreator")
  updatedSalesTargets  SalesTarget[] @relation("SalesTargetUpdater")
}
```

### 2.4 マイグレーション

```sql
CREATE TABLE sales_targets (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  target_month VARCHAR(7) NOT NULL,
  target_amount DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_by INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(business_id, target_month)
);

CREATE INDEX idx_sales_targets_business_month ON sales_targets(business_id, target_month);
```

---

## 3. 売上計上ルール

### 3.1 型定義

```typescript
// src/types/business-config.ts に追加

interface RevenueRecognition {
  /** 売上計上対象のステータスコード（BusinessStatusDefinitionのstatusCode） */
  statusCode: string;
  /** 金額フィールドキー（projectCustomData内のフィールド） */
  amountField: string;
  /** 計上月基準（"projectExpectedCloseMonth" or カスタムフィールドキー） */
  dateField: string;
}

interface BusinessConfig {
  projectFields: ProjectFieldDefinition[];
  revenueRecognition?: RevenueRecognition;
}
```

### 3.2 計上月の決定ロジック

```typescript
// src/lib/revenue-helpers.ts

/**
 * 案件の計上月を取得する
 */
function getRevenueMonth(
  project: Project,
  dateField: string
): string | null {
  if (dateField === 'projectExpectedCloseMonth') {
    return project.projectExpectedCloseMonth; // "YYYY-MM"
  }

  // カスタムフィールドの場合
  const customData = project.projectCustomData as Record<string, unknown>;
  const value = customData[dateField];

  if (!value) return null;

  // date型 ("YYYY-MM-DD") → "YYYY-MM"
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return value.substring(0, 7);
  }

  // month型 ("YYYY-MM") → そのまま
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}$/)) {
    return value;
  }

  return null;
}

/**
 * 案件の売上金額を取得する
 */
function getRevenueAmount(
  project: Project,
  amountField: string
): number {
  const customData = project.projectCustomData as Record<string, unknown>;
  const value = customData[amountField];
  return typeof value === 'number' ? value : 0;
}
```

---

## 4. 売上目標API

### 4.1 GET `/api/v1/businesses/:id/sales-targets`

年度の目標一覧 + 実績を返す。

**リクエスト:**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `year` | number (query) | 年度開始年（例: 2025 → 2025/04〜2026/03） |

**レスポンス:**

```typescript
{
  success: true,
  data: {
    businessId: number;
    year: number;
    revenueRecognition: RevenueRecognition | null;
    months: {
      month: string;         // "2025-04"
      targetAmount: number;  // 目標金額（未設定 = 0）
      actualAmount: number;  // 実績金額（計上ルール未設定 = 0）
      achievementRate: number | null; // 達成率（目標0 = null）
    }[];
    yearTotal: {
      targetAmount: number;
      actualAmount: number;
      achievementRate: number | null;
    };
  }
}
```

**処理フロー:**

1. `SalesTarget` から年度分（12ヶ月）を取得
2. `Business.businessConfig.revenueRecognition` を取得
3. 計上ルールがある場合、各月の実績を集計（[5. 売上実績集計ロジック](#5-売上実績集計ロジック)）
4. 達成率 = 実績 / 目標（目標0の場合は null）

### 4.2 PUT `/api/v1/businesses/:id/sales-targets`

年度の目標を一括保存（upsert）。

**リクエスト:**

```typescript
{
  year: number;
  targets: {
    month: string;      // "2025-04"
    targetAmount: number;
  }[];
}
```

**処理フロー:**

1. admin 権限チェック
2. 各月を `upsert`（`businessId` + `targetMonth` で一意）
3. `targetAmount === 0` の月は削除（レコードを残さない）
4. トランザクション内で実行

**バリデーション:**

```typescript
const salesTargetSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  targets: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    targetAmount: z.number().min(0),
  })).length(12),
});
```

---

## 5. 売上実績集計ロジック

### 5.1 集計関数

```typescript
// src/lib/revenue-helpers.ts

interface MonthlyRevenue {
  month: string;       // "YYYY-MM"
  actualAmount: number;
  projectCount: number;
}

/**
 * 事業の月別売上実績を集計する
 */
async function calculateMonthlyRevenue(
  prisma: PrismaClient,
  businessId: number,
  revenueRecognition: RevenueRecognition,
  startMonth: string,  // "2025-04"
  endMonth: string     // "2026-03"
): Promise<MonthlyRevenue[]> {
  // 1. 対象ステータスの案件を取得
  const projects = await prisma.project.findMany({
    where: {
      businessId,
      projectSalesStatus: revenueRecognition.statusCode,
      isActive: true,
    },
    select: {
      id: true,
      projectExpectedCloseMonth: true,
      projectCustomData: true,
    },
  });

  // 2. 各案件の計上月・金額を取得してグルーピング
  const monthMap = new Map<string, { amount: number; count: number }>();

  for (const project of projects) {
    const month = getRevenueMonth(project, revenueRecognition.dateField);
    const amount = getRevenueAmount(project, revenueRecognition.amountField);

    if (!month || month < startMonth || month > endMonth) continue;

    const entry = monthMap.get(month) || { amount: 0, count: 0 };
    entry.amount += amount;
    entry.count += 1;
    monthMap.set(month, entry);
  }

  // 3. 結果を配列に変換
  return Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    actualAmount: data.amount,
    projectCount: data.count,
  }));
}
```

### 5.2 パフォーマンス考慮

- 集計は API 呼び出し時に都度実行（キャッシュなし）
- 案件数が1000件を超える場合のパフォーマンスを考慮
  - `SELECT` で必要最小限のフィールドのみ取得
  - インデックス: `projects(business_id, project_sales_status, is_active)`
- 将来的にキャッシュや集計テーブルの導入を検討

### 5.3 フィルター付き集計（ダッシュボード用）

```typescript
/**
 * パートナー絞り込み付き集計
 */
async function calculateMonthlyRevenueByPartner(
  prisma: PrismaClient,
  businessId: number,
  revenueRecognition: RevenueRecognition,
  partnerId: number | null,  // null = 直販
  startMonth: string,
  endMonth: string
): Promise<MonthlyRevenue[]>
```

---

## 6. 売上目標タブUI

### 6.1 ファイル

`src/components/features/business/sales-targets-tab.tsx`

### 6.2 配置

事業詳細ページのタブに追加:

```typescript
// src/config/entities/business.ts の detailConfig.tabs に追加
{
  key: 'sales-targets',
  label: '売上目標',
  component: 'custom',
}
```

### 6.3 UIレイアウト

```
売上目標設定
年度: [◀ 2025 ▶]    [一括入力: ¥____ /月]  [保存]

┌──────┬───────────────┬───────────────┬──────────┐
│ 月   │ 目標金額       │ 実績金額       │ 達成率   │
├──────┼───────────────┼───────────────┼──────────┤
│04月  │ [¥10,000,000] │ ¥8,500,000    │ 85.0%   │
│05月  │ [¥12,000,000] │ ¥13,200,000   │ 110.0%  │
│06月  │ [¥15,000,000] │ ¥0            │ 0.0%    │
│...   │ [           ] │               │         │
├──────┼───────────────┼───────────────┼──────────┤
│年間計│ ¥144,000,000  │ ¥21,700,000   │ 15.1%   │
└──────┴───────────────┴───────────────┴──────────┘

※ 計上ルールが未設定の場合: 実績列に「計上ルール未設定」と表示
```

### 6.4 コンポーネント実装

```typescript
interface SalesTargetsTabProps {
  businessId: number;
}

function SalesTargetsTab({ businessId }: SalesTargetsTabProps) {
  const [year, setYear] = useState(getCurrentFiscalYear());
  const [isEditing, setIsEditing] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>({});

  // データ取得
  const { data } = useQuery({
    queryKey: ['sales-targets', businessId, year],
    queryFn: () => apiClient.get(`/businesses/${businessId}/sales-targets?year=${year}`),
  });

  // 一括入力
  const handleBulkInput = (monthlyAmount: number) => {
    // 全12ヶ月に同額を設定
  };

  // 保存
  const handleSave = () => {
    // PUT /api/v1/businesses/:id/sales-targets
  };
}
```

### 6.5 一括入力機能

「一括入力」ボタンをクリックすると、金額入力フィールドが表示される。入力した金額が全12ヶ月にセットされる。その後個別に編集可能。

### 6.6 権限

- admin のみ編集可能
- staff は閲覧のみ（入力欄はdisabled）
- partner 系はこのタブ自体が非表示

---

## 7. 計上ルール設定UI

### 7.1 配置

事業詳細の設定タブ（既存）に「売上計上ルール」セクションを追加。

### 7.2 UIレイアウト

```
━━ 売上計上ルール ━━

計上ステータス: [ドロップダウン: 事業のステータス定義から]
金額フィールド: [ドロップダウン: projectFieldsのnumber型のみ]
計上月基準:     [ドロップダウン: "受注予定月" | projectFieldsのdate/month型]

[保存]

※ 未設定の場合: ダッシュボードと売上目標の実績列は「計上ルール未設定」表示
```

### 7.3 ドロップダウン選択肢の生成

```typescript
// 計上ステータス: 事業のステータス定義から
const statusOptions = statusDefinitions.map(s => ({
  value: s.statusCode,
  label: s.statusLabel,
}));

// 金額フィールド: projectFieldsのnumber型のみ
const amountFieldOptions = projectFields
  .filter(f => f.type === 'number')
  .map(f => ({
    value: f.key,
    label: f.label,
  }));

// 計上月基準: "受注予定月" + date/month型のカスタムフィールド
const dateFieldOptions = [
  { value: 'projectExpectedCloseMonth', label: '受注予定月' },
  ...projectFields
    .filter(f => f.type === 'date' || f.type === 'month')
    .map(f => ({
      value: f.key,
      label: f.label,
    })),
];
```

### 7.4 保存先

`Business.businessConfig` の `revenueRecognition` フィールドとして保存。既存の `PATCH /api/v1/businesses/:id` で `businessConfig` を更新する。

---

## 8. バリデーション

### 8.1 売上目標

```typescript
// src/lib/validations/sales-target.ts
export const salesTargetBulkSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  targets: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, '月の形式が不正です'),
    targetAmount: z.number().min(0, '金額は0以上で入力してください'),
  })).length(12, '12ヶ月分の目標を入力してください'),
});
```

### 8.2 計上ルール

```typescript
export const revenueRecognitionSchema = z.object({
  statusCode: z.string().min(1, 'ステータスを選択してください'),
  amountField: z.string().min(1, '金額フィールドを選択してください'),
  dateField: z.string().min(1, '計上月基準を選択してください'),
}).nullable();
```

---

## 9. 実装チェックリスト

### Step 1: データモデル

- [ ] `SalesTarget` Prismaモデル追加
- [ ] `Business` / `User` にリレーション追加
- [ ] マイグレーション実行
- [ ] `RevenueRecognition` 型定義追加

### Step 2: 売上計上ルール

- [ ] `revenue-helpers.ts` — 計上月・金額取得関数
- [ ] 事業詳細の設定タブに計上ルールUIセクション追加
- [ ] `businessConfig.revenueRecognition` の保存・取得

### Step 3: 売上目標

- [ ] `GET /api/v1/businesses/:id/sales-targets` — 年度目標 + 実績取得
- [ ] `PUT /api/v1/businesses/:id/sales-targets` — 年度目標一括保存
- [ ] `sales-targets-tab.tsx` — 目標設定UI
- [ ] 一括入力機能
- [ ] 年度切替
- [ ] admin 権限制御

### Step 4: 売上実績集計

- [ ] `calculateMonthlyRevenue()` — 月別実績集計
- [ ] `calculateMonthlyRevenueByPartner()` — 代理店別集計
- [ ] 計上ルール未設定時のフォールバック処理
