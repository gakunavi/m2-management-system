# Phase 4: ダッシュボード詳細設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [08_PHASE4_PRD.md](../08_PHASE4_PRD.md) | Phase 4 全体PRD |
> | [SALES_TARGET_DESIGN.md](./SALES_TARGET_DESIGN.md) | 売上目標・計上ルール設計 |

---

## 目次

1. [実装概要](#1-実装概要)
2. [ダッシュボード切替ロジック](#2-ダッシュボード切替ロジック)
3. [全社ダッシュボード](#3-全社ダッシュボード)
4. [事業別ダッシュボード](#4-事業別ダッシュボード)
5. [チャートコンポーネント](#5-チャートコンポーネント)
6. [実装チェックリスト](#6-実装チェックリスト)

---

## 1. 実装概要

### 1.1 機能スコープ

| 機能 | 説明 |
|------|------|
| 全社ダッシュボード | 全事業横断のKPI・売上推移・パイプライン・事業別サマリー |
| 事業別ダッシュボード | 事業単位のKPI・売上推移・パイプライン・代理店ランキング・アクティビティ |
| 事業セレクター連動 | `useBusiness()` の `selectedBusinessId` で切替 |

### 1.2 ライブラリ追加

```bash
npm install recharts
```

### 1.3 ファイル構成

```
src/app/(auth)/dashboard/
├── page.tsx                   # Server Component（既存置換）
└── _client.tsx                # クライアント本体

src/components/features/dashboard/
├── kpi-summary-cards.tsx      # KPIサマリーカード（4枚）
├── revenue-trend-chart.tsx    # 売上推移グラフ（Bar + Line）
├── pipeline-chart.tsx         # パイプラインチャート（横棒）
├── partner-ranking.tsx        # 代理店別ランキング
├── business-summary-list.tsx  # 事業別サマリー（全社用）
├── activity-feed.tsx          # 直近アクティビティ
└── dashboard-empty-state.tsx  # 空状態（計上ルール未設定等）
```

---

## 2. ダッシュボード切替ロジック

### 2.1 ページ構造

```tsx
// src/app/(auth)/dashboard/_client.tsx

function DashboardClient() {
  const { selectedBusinessId } = useBusiness();
  const { user } = useAuth();

  // 全社ダッシュボード or 事業別ダッシュボード
  if (selectedBusinessId === null) {
    return <CompanyDashboard />;
  }

  return <BusinessDashboard businessId={selectedBusinessId} />;
}
```

### 2.2 ロールベースアクセス

| ロール | 全社ダッシュボード | 事業別ダッシュボード |
|--------|-------------------|---------------------|
| admin | 全事業のデータ | 選択事業のデータ |
| staff | アサイン済み事業のデータ | アサイン済み事業のみ |
| partner_admin | × (`/portal` へ) | × (`/portal` へ) |
| partner_staff | × (`/portal` へ) | × (`/portal` へ) |

- partner 系は `/dashboard` にアクセスしても `/portal` にリダイレクト
- staff はアサインされていない事業のデータは除外

---

## 3. 全社ダッシュボード

### 3.1 CompanyDashboard コンポーネント

```tsx
function CompanyDashboard() {
  const [year, setYear] = useState(getCurrentFiscalYear());

  const { data: summary } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiClient.get('/dashboard/summary'),
  });

  const { data: revenueTrend } = useQuery({
    queryKey: ['dashboard', 'revenue-trend', year],
    queryFn: () => apiClient.get(`/dashboard/revenue-trend?year=${year}`),
  });

  const { data: pipeline } = useQuery({
    queryKey: ['dashboard', 'pipeline'],
    queryFn: () => apiClient.get('/dashboard/pipeline'),
  });

  return (
    <div className="space-y-6">
      <KpiSummaryCards data={summary} />
      <RevenueTrendChart data={revenueTrend} year={year} onYearChange={setYear} />
      <div className="grid grid-cols-2 gap-6">
        <PipelineChart data={pipeline} />
        <BusinessSummaryList data={summary?.businessSummaries} />
      </div>
    </div>
  );
}
```

### 3.2 KPI サマリーカード

4枚のカードを横並びで表示:

```tsx
interface KpiCardData {
  label: string;
  value: string;           // フォーマット済み（"¥21.7M"）
  change: string;          // "▲12% MoM" or "▼3pt MoM"
  changeType: 'positive' | 'negative' | 'neutral';
}

interface KpiSummaryCardsProps {
  data: {
    revenue: KpiCardData;      // 売上実績
    achievementRate: KpiCardData; // 目標達成率
    totalProjects: KpiCardData;  // 案件総数
    wonProjects: KpiCardData;    // 受注案件数
  };
}
```

**カードのデザイン:**

```
┌──────────────────┐
│ 売上実績         │  ← ラベル（灰色テキスト）
│ ¥21,700,000     │  ← 値（大きく太字）
│ ▲ 12% 前月比    │  ← 変化（緑=up、赤=down）
└──────────────────┘
```

- Card コンポーネント（shadcn/ui）を使用
- `grid-cols-4` で4枚横並び
- 前月比の矢印と色でトレンドを視覚化

### 3.3 売上推移グラフ

Recharts `ComposedChart` を使用:

```tsx
interface RevenueTrendChartProps {
  data: {
    months: {
      month: string;         // "2025-04"
      monthLabel: string;    // "4月"
      targetAmount: number;
      actualAmount: number;
    }[];
  };
  year: number;
  onYearChange: (year: number) => void;
}
```

**チャート構成:**
- 棒グラフ（`Bar`）: 月別実績 → 青系
- 折れ線（`Line`）: 月別目標 → 灰色点線
- X軸: 月ラベル
- Y軸: 金額（万円 or 百万円単位に自動スケール）
- 年度切替: `◀ 2025 ▶` ボタン

### 3.4 パイプラインチャート

横棒グラフでステータス別の件数・金額を表示:

```tsx
interface PipelineChartProps {
  data: {
    statuses: {
      statusCode: string;
      statusLabel: string;
      statusColor: string;
      projectCount: number;
      totalAmount: number;
    }[];
  };
}
```

**チャート構成:**
- 横棒グラフ（`BarChart` layout="vertical"）
- 各棒にステータスの色を使用
- ラベルに件数と金額を併記

### 3.5 事業別サマリー

テーブル形式で事業ごとの概要を表示:

```tsx
interface BusinessSummaryListProps {
  data: {
    businessId: number;
    businessName: string;
    actualAmount: number;
    targetAmount: number;
    achievementRate: number | null;
    projectCount: number;
  }[];
}
```

- 事業名クリック → 事業セレクターをその事業に切替（事業別ダッシュボードへ）
- 達成率をプログレスバーで視覚化
- ソート: 売上金額の降順

---

## 4. 事業別ダッシュボード

### 4.1 BusinessDashboard コンポーネント

```tsx
function BusinessDashboard({ businessId }: { businessId: number }) {
  const [year, setYear] = useState(getCurrentFiscalYear());

  const { data: summary } = useQuery({
    queryKey: ['dashboard', 'summary', businessId],
    queryFn: () => apiClient.get(`/dashboard/summary?businessId=${businessId}`),
  });

  const { data: revenueTrend } = useQuery({
    queryKey: ['dashboard', 'revenue-trend', businessId, year],
    queryFn: () => apiClient.get(`/dashboard/revenue-trend?businessId=${businessId}&year=${year}`),
  });

  const { data: pipeline } = useQuery({
    queryKey: ['dashboard', 'pipeline', businessId],
    queryFn: () => apiClient.get(`/dashboard/pipeline?businessId=${businessId}`),
  });

  const { data: partnerRanking } = useQuery({
    queryKey: ['dashboard', 'partner-ranking', businessId],
    queryFn: () => apiClient.get(`/dashboard/partner-ranking?businessId=${businessId}`),
  });

  const { data: activity } = useQuery({
    queryKey: ['dashboard', 'activity', businessId],
    queryFn: () => apiClient.get(`/dashboard/activity?businessId=${businessId}`),
  });

  return (
    <div className="space-y-6">
      <KpiSummaryCards data={summary} />
      <RevenueTrendChart data={revenueTrend} year={year} onYearChange={setYear} />
      <div className="grid grid-cols-2 gap-6">
        <PipelineChart data={pipeline} />
        <PartnerRanking data={partnerRanking} />
      </div>
      <ActivityFeed data={activity} />
    </div>
  );
}
```

### 4.2 代理店別ランキング

```tsx
interface PartnerRankingProps {
  data: {
    rankings: {
      rank: number;
      partnerId: number | null;  // null = 直販
      partnerName: string;
      totalAmount: number;
      projectCount: number;
    }[];
  };
}
```

- 上位10件を表示
- `partnerId === null` → 「直販」として表示
- バーチャートまたはリスト形式
- 金額のフォーマット: `¥8,000,000` → `¥800万`

### 4.3 直近アクティビティ

```tsx
interface ActivityFeedProps {
  data: {
    activities: {
      id: number;
      type: 'status_change' | 'created' | 'updated';
      projectId: number;
      projectNo: string;
      customerName: string;
      description: string;    // "ステータス変更: 商談中 → 受注済み"
      timestamp: string;      // ISO datetime
      userName: string;       // 操作者名
    }[];
  };
}
```

- 直近20件
- 相対時間表示: "2時間前", "昨日", "3日前"
- 案件番号クリック → 案件詳細へ遷移
- アイコン: ステータス変更=矢印、新規作成=プラス、更新=ペン

---

## 5. チャートコンポーネント

### 5.1 共通設定

```typescript
// src/components/features/dashboard/chart-config.ts

export const CHART_COLORS = {
  primary: '#3b82f6',     // blue-500（実績バー）
  secondary: '#9ca3af',   // gray-400（目標線）
  success: '#22c55e',     // green-500（達成）
  warning: '#f59e0b',     // amber-500（未達）
  danger: '#ef4444',      // red-500（失注）
} as const;

export const CHART_DEFAULTS = {
  barSize: 32,
  lineStrokeWidth: 2,
  tooltipStyle: {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '12px',
  },
} as const;
```

### 5.2 金額フォーマット

```typescript
/**
 * 金額を短縮表示する
 * 1000 → "¥1,000"
 * 1000000 → "¥100万"
 * 10000000 → "¥1,000万"
 * 100000000 → "¥1億"
 */
function formatCurrency(amount: number, short?: boolean): string
```

### 5.3 Recharts カスタムツールチップ

各チャートに独自のツールチップコンポーネントを定義:

```tsx
function RevenueTrendTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload) return null;
  return (
    <div className="bg-white p-3 rounded-lg shadow border">
      <p className="font-medium">{label}</p>
      <p className="text-blue-600">実績: {formatCurrency(payload[0].value)}</p>
      <p className="text-gray-500">目標: {formatCurrency(payload[1].value)}</p>
    </div>
  );
}
```

---

## 6. 実装チェックリスト

### Step 1: Recharts 導入

- [ ] `npm install recharts` 実行
- [ ] `chart-config.ts` — 共通色・設定定義
- [ ] 金額フォーマット関数

### Step 2: ダッシュボードAPI

- [ ] `GET /api/v1/dashboard/summary` — KPIサマリー
  - [ ] 全社モード（businessId 省略）: 全事業の売上合計・案件数合計
  - [ ] 事業別モード（businessId 指定）: 指定事業のみ
  - [ ] 前月比の計算
  - [ ] staff のアサイン事業フィルタリング
- [ ] `GET /api/v1/dashboard/revenue-trend` — 月別売上推移
  - [ ] 年度パラメータで12ヶ月分の目標+実績
  - [ ] 計上ルール未設定時のフォールバック
- [ ] `GET /api/v1/dashboard/pipeline` — パイプライン
  - [ ] ステータス別の件数と金額
  - [ ] 事業のステータス定義と連動
- [ ] `GET /api/v1/dashboard/partner-ranking` — 代理店ランキング
  - [ ] 事業別モードのみ（全社では非表示）
  - [ ] 直販（partner_id IS NULL）も含む
  - [ ] 上位10件
- [ ] `GET /api/v1/dashboard/activity` — 直近アクティビティ
  - [ ] 案件の作成・更新をタイムライン形式で
  - [ ] 直近20件
  - [ ] ステータス変更の検出（前回のステータスとの比較）

### Step 3: 全社ダッシュボード

- [ ] `dashboard/page.tsx` + `_client.tsx` の置換
- [ ] `CompanyDashboard` コンポーネント
- [ ] `KpiSummaryCards` — 4枚のKPIカード
- [ ] `RevenueTrendChart` — 売上推移（Bar + Line）
- [ ] `PipelineChart` — パイプライン（横棒）
- [ ] `BusinessSummaryList` — 事業別サマリー
- [ ] partner ロールの `/portal` リダイレクト

### Step 4: 事業別ダッシュボード

- [ ] `BusinessDashboard` コンポーネント
- [ ] KPIカード（事業単位）
- [ ] 売上推移（事業単位）
- [ ] パイプライン（事業単位）
- [ ] `PartnerRanking` — 代理店ランキング
- [ ] `ActivityFeed` — 直近アクティビティ

### Step 5: 空状態・エッジケース

- [ ] 計上ルール未設定時の表示（「計上ルールを設定してください」バナー）
- [ ] データがない月の0表示
- [ ] 目標未設定月の達成率「-」表示
- [ ] staff で事業未アサインの場合のメッセージ
