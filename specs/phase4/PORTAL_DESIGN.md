# Phase 4: 代理店ポータル詳細設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [08_PHASE4_PRD.md](../08_PHASE4_PRD.md) | Phase 4 全体PRD |
> | [SALES_TARGET_DESIGN.md](./SALES_TARGET_DESIGN.md) | 売上計上ルール |

---

## 目次

1. [実装概要](#1-実装概要)
2. [代理店のデータスコープ](#2-代理店のデータスコープ)
3. [ポータルAPI](#3-ポータルapi)
4. [ポータルUI](#4-ポータルui)
5. [実装チェックリスト](#5-実装チェックリスト)

---

## 1. 実装概要

### 1.1 機能スコープ

| 機能 | 説明 |
|------|------|
| 事業別サマリーカード | 関与事業ごとの売上・案件数 |
| パイプライン | 自社案件のステータス別件数・金額 |
| 案件一覧 | 自社+下位代理店の案件をテーブル表示 |

### 1.2 ファイル構成

```
src/app/(partner)/portal/
├── page.tsx                   # Server Component（既存置換）
└── _client.tsx                # クライアント本体

src/app/api/v1/portal/
├── summary/route.ts           # 事業別サマリー
├── pipeline/route.ts          # パイプライン
└── projects/route.ts          # 案件一覧

src/components/features/portal/
├── portal-summary-cards.tsx   # サマリーカード
├── portal-pipeline.tsx        # パイプライン
└── portal-project-list.tsx    # 案件一覧テーブル
```

---

## 2. 代理店のデータスコープ

### 2.1 スコープルール

| ロール | 案件の可視範囲 |
|--------|---------------|
| partner_admin | 自社（`partnerId = ownPartnerId`）+ 下位代理店の全案件 |
| partner_staff | 自分がアサインされた案件のみ（`projectAssignedUserId = userId`）|

### 2.2 下位代理店の取得

```typescript
/**
 * 自社 + 全下位代理店のIDリストを取得する
 */
async function getPartnerScope(
  prisma: PrismaClient,
  partnerId: number
): Promise<number[]> {
  // 1. 自社のID
  const ids = [partnerId];

  // 2. 再帰的に子代理店を取得
  // Partner.parentId で親子関係をたどる
  async function collectChildren(parentId: number) {
    const children = await prisma.partner.findMany({
      where: { parentId, isActive: true },
      select: { id: true },
    });
    for (const child of children) {
      ids.push(child.id);
      await collectChildren(child.id);
    }
  }

  await collectChildren(partnerId);
  return ids;
}
```

### 2.3 事業の可視範囲

代理店が関与している事業のみ表示:

```typescript
/**
 * 代理店が関与している事業IDリストを取得する
 */
async function getPartnerBusinessIds(
  prisma: PrismaClient,
  partnerIds: number[]
): Promise<number[]> {
  // partner_business_links テーブルから事業IDを取得
  // または、案件が存在する事業を集計
  const projects = await prisma.project.findMany({
    where: {
      partnerId: { in: partnerIds },
      isActive: true,
    },
    select: { businessId: true },
    distinct: ['businessId'],
  });
  return projects.map(p => p.businessId);
}
```

---

## 3. ポータルAPI

### 3.1 GET `/api/v1/portal/summary`

事業別のサマリーを返す。

**レスポンス:**

```typescript
{
  success: true,
  data: {
    businesses: {
      businessId: number;
      businessName: string;
      totalAmount: number;        // 売上金額（計上ルールに基づく）
      projectCount: number;       // 案件数
      wonProjectCount: number;    // 受注案件数
    }[];
    totals: {
      totalAmount: number;
      projectCount: number;
      wonProjectCount: number;
    };
  }
}
```

**処理フロー:**

1. セッションから `user.partnerId` 取得
2. `getPartnerScope()` で自社+下位代理店のIDリスト取得
3. `getPartnerBusinessIds()` で関与事業を取得
4. 各事業の計上ルールに基づいて金額集計
5. partner_staff の場合: `projectAssignedUserId` でさらに絞り込み

### 3.2 GET `/api/v1/portal/pipeline`

自社案件のステータス別分布。

**クエリパラメータ:**

| パラメータ | 説明 |
|-----------|------|
| `businessId` | 事業ID（省略時 = 全事業） |

**レスポンス:**

```typescript
{
  success: true,
  data: {
    statuses: {
      statusCode: string;
      statusLabel: string;
      statusColor: string;
      projectCount: number;
      totalAmount: number;
    }[];
  }
}
```

### 3.3 GET `/api/v1/portal/projects`

自社案件一覧（ページネーション付き）。

**クエリパラメータ:**

| パラメータ | 説明 |
|-----------|------|
| `businessId` | 事業ID（省略時 = 全事業） |
| `page` | ページ番号 |
| `pageSize` | 1ページの件数（デフォルト: 20） |
| `sortBy` | ソートフィールド |
| `sortOrder` | asc / desc |

**レスポンス:**

```typescript
{
  success: true,
  data: {
    projectNo: string;
    customerName: string;
    businessName: string;
    projectSalesStatus: string;
    projectSalesStatusLabel: string;
    projectSalesStatusColor: string;
    projectExpectedCloseMonth: string | null;
    amount: number | null;        // 計上ルールの金額フィールド
    projectAssignedUserName: string | null;
    updatedAt: string;
  }[],
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }
}
```

---

## 4. ポータルUI

### 4.1 PortalClient コンポーネント

```tsx
// src/app/(partner)/portal/_client.tsx

function PortalClient() {
  const { user } = useAuth();
  const [selectedBusiness, setSelectedBusiness] = useState<number | null>(null);

  const { data: summary } = useQuery({
    queryKey: ['portal', 'summary'],
    queryFn: () => apiClient.get('/portal/summary'),
  });

  const { data: pipeline } = useQuery({
    queryKey: ['portal', 'pipeline', selectedBusiness],
    queryFn: () => apiClient.get(`/portal/pipeline${selectedBusiness ? `?businessId=${selectedBusiness}` : ''}`),
  });

  const { data: projects } = useQuery({
    queryKey: ['portal', 'projects', selectedBusiness, page],
    queryFn: () => apiClient.get(`/portal/projects?page=${page}${selectedBusiness ? `&businessId=${selectedBusiness}` : ''}`),
  });

  return (
    <div className="space-y-6">
      <PortalSummaryCards
        businesses={summary?.businesses}
        onBusinessClick={setSelectedBusiness}
      />
      <PortalPipeline data={pipeline} />
      <PortalProjectList data={projects} />
    </div>
  );
}
```

### 4.2 PortalSummaryCards

```tsx
interface PortalSummaryCardsProps {
  businesses: {
    businessId: number;
    businessName: string;
    totalAmount: number;
    projectCount: number;
  }[];
  onBusinessClick: (businessId: number | null) => void;
}
```

- 事業ごとにカードを表示（最大4枚で折り返し）
- カードクリック → パイプラインと案件一覧をフィルタリング
- 選択中のカードはハイライト表示
- 「すべて」ボタンでフィルター解除

### 4.3 PortalPipeline

- パイプラインチャート（ダッシュボードの `PipelineChart` を再利用可能）
- 自社案件のステータス別分布
- 事業カードの選択で絞り込み

### 4.4 PortalProjectList

```tsx
interface PortalProjectListProps {
  data: {
    projects: ProjectRow[];
    meta: PaginationMeta;
  };
}
```

- シンプルなテーブル（`EntityListTemplate` は使わない）
- 表示列: 案件番号、顧客名、事業名、ステータス、予定月、金額、担当者、更新日
- ソート対応（列ヘッダークリック）
- ページネーション
- 案件番号は案件詳細へのリンク（閲覧のみ）
- 読み取り専用（インライン編集なし）

---

## 5. 実装チェックリスト

### Step 1: スコープロジック

- [ ] `getPartnerScope()` — 自社+下位代理店IDリスト取得
- [ ] `getPartnerBusinessIds()` — 関与事業IDリスト取得
- [ ] partner_staff の assignedUser フィルタリング

### Step 2: ポータルAPI

- [ ] `GET /api/v1/portal/summary` — 事業別サマリー
  - [ ] partner_admin: 自社+下位代理店の案件
  - [ ] partner_staff: アサイン済み案件のみ
  - [ ] 計上ルールに基づく金額集計
- [ ] `GET /api/v1/portal/pipeline` — パイプライン
  - [ ] businessId フィルター対応
  - [ ] ステータス定義との連動
- [ ] `GET /api/v1/portal/projects` — 案件一覧
  - [ ] ページネーション
  - [ ] ソート
  - [ ] businessId フィルター

### Step 3: ポータルUI

- [ ] `portal/page.tsx` + `_client.tsx` の置換
- [ ] `PortalSummaryCards` — 事業別サマリーカード
- [ ] `PortalPipeline` — パイプラインチャート
- [ ] `PortalProjectList` — 案件一覧テーブル
- [ ] 事業カードの選択によるフィルタリング

### Step 4: アクセス制御

- [ ] `/dashboard` への partner 系アクセスを `/portal` へリダイレクト
- [ ] partner_staff の案件スコープ制限の検証
- [ ] 案件詳細ページの partner 系アクセス制御（閲覧のみ）
