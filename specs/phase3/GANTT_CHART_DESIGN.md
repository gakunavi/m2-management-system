# Phase 3 残務: ガントチャート詳細設計書（実装者向け）

> **前提ドキュメント**: 本書は以下に準拠する。矛盾がある場合は上位ドキュメントを優先。
>
> | ドキュメント | 参照内容 |
> |---|---|
> | [00_PROJECT_PRD.md](../00_PROJECT_PRD.md) | 全体ゴール、ユーザー種別、技術スタック |
> | [07_PHASE3_REMAINING_PRD.md](../07_PHASE3_REMAINING_PRD.md) | Phase 3 残務 PRD |

> **ステータス**: 実装完了

---

## 目次

1. [実装概要](#1-実装概要)
2. [アーキテクチャ（フルスクラッチ実装）](#2-アーキテクチャフルスクラッチ実装)
3. [データ変換](#3-データ変換)
4. [時間軸の計算](#4-時間軸の計算)
5. [コンポーネント設計](#5-コンポーネント設計)
6. [案件詳細への統合](#6-案件詳細への統合)
7. [ムーブメント一覧への統合](#7-ムーブメント一覧への統合)
8. [実装チェックリスト](#8-実装チェックリスト)

---

## 1. 実装概要

### 1.1 機能スコープ

| 機能 | 説明 |
|------|------|
| ガントチャートコンポーネント | フルスクラッチの `GanttChart` コンポーネント（外部ライブラリ不使用） |
| 案件詳細統合 | 案件詳細のムーブメントタブ内にガントチャートを追加 |
| ムーブメント一覧統合 | `/movements` ページにマトリクス/ガントの表示切替を追加 |
| 日/週/月表示切替 | 3段階のビューモード切替（Day / Week / Month） |
| バークリック → 編集モーダル | 既存の `MovementEditModal` を再利用 |

### 1.2 技術選定

当初 Frappe Gantt の使用を計画していたが、以下の理由からフルスクラッチで実装した:

| 理由 | 詳細 |
|------|------|
| デザイン統一 | プロジェクトの Tailwind CSS + shadcn/ui のデザインシステムと完全に統合 |
| 柔軟性 | 受注予定月マーカー、ステータス色分け、ラベル列の固定など自由にカスタマイズ可能 |
| 軽量性 | 外部ライブラリの依存なし |
| SSR対応 | `'use client'` ディレクティブのみで動作。dynamic import 不要 |

### 1.3 新規API

不要。既存APIで取得可能。

| 用途 | 既存API |
|------|---------|
| 一覧ガントチャート | `GET /api/v1/projects/movements?businessId=X` |
| 案件詳細ガントチャート | `GET /api/v1/projects/:id/movements` |

---

## 2. アーキテクチャ（フルスクラッチ実装）

### 2.1 ファイル構成

```
src/components/features/project/
├── gantt-chart.tsx              # メインコンポーネント（描画・インタラクション）
├── gantt-chart-utils.ts         # データ変換・時間軸計算・ユーティリティ
├── project-movements-tab.tsx    # 既存（マトリクス表 + ガントチャートを統合）
└── movement-edit-modal.tsx      # 既存（再利用）

src/app/(auth)/movements/
├── _client.tsx                  # 既存（マトリクス/ガントチャートの表示切替を追加）
└── page.tsx                     # 既存
```

### 2.2 主要な型定義

```typescript
// gantt-chart-utils.ts

/** ガントチャートに描画するバー1本 */
interface GanttBar {
  id: string;
  movementId: number;
  projectId: number;
  label: string;
  status: MovementStatus;    // 'pending' | 'started' | 'completed' | 'skipped'
  startDate: Date | null;
  endDate: Date | null;
  stepName: string;
  stepNumber: number;
}

/** ガントチャートの1行（案件単位 or ステップ単位） */
interface GanttRow {
  id: string;
  label: string;
  subLabel?: string;
  projectId: number;
  bars: GanttBar[];
  expectedCloseMonth?: string | null;  // YYYY-MM 形式。目標線として描画
}

/** タイムラインの1列 */
interface TimelineColumn {
  label: string;
  startDate: Date;
  endDate: Date;
}

/** ビューモード */
type ViewMode = 'Day' | 'Week' | 'Month';
```

---

## 3. データ変換

### 3.1 一覧モード（`toGanttRowsForList`）

APIレスポンス (`MovementOverviewResponse`) → `GanttRow[]` に変換:

- 案件ごとに1行（`label` = 顧客名 or 案件番号、`subLabel` = 案件番号）
- `movementStartedAt` がある（= pending以外の）ムーブメントのみバーとして描画
- `started` ステータスの場合は `endDate` を今日に設定（進行中バー）
- `expectedCloseMonth` を行に保持（目標線描画用）

### 3.2 案件詳細モード（`toGanttRowsForDetail`）

案件詳細のムーブメント配列 (`DetailMovement[]`) → `GanttRow[]` に変換:

- ステップごとに1行（`label` = ステップ名）
- `movementStartedAt` がないステップは空のバー配列（「未着手」表示）

---

## 4. 時間軸の計算

### 4.1 タイムライン範囲の算出（`getDateRange`）

全バーの日付範囲 + 受注予定月 + 今日の日付を元にタイムライン全体の最小/最大日付を算出:

```
min = min(全バーのstartDate, 今日)
max = max(全バーのendDate, 全行のexpectedCloseMonth月末, 今日)
余白 = 前後2週間
```

**重要**: 受注予定月と今日の日付を必ずタイムライン範囲に含めることで、目標月までスクロール可能にし、今日線が正しい位置に表示される。

### 4.2 列の生成

| 関数 | 単位 | 列幅(px) | ラベル例 |
|------|------|----------|----------|
| `buildDayColumns` | 日 | 36 | `2/26` |
| `buildWeekColumns` | 週（月曜始まり） | 80 | `2/24〜` |
| `buildMonthColumns` | 月 | 120 | `2026/02` |

### 4.3 バーの位置計算（`calcBarPosition`）

タイムライン全体の `minDate` 〜 `maxDate` に対するバーの `leftPercent` と `widthPercent` を算出。パーセントベースでタイムライン幅に対して相対配置。

---

## 5. コンポーネント設計

### 5.1 GanttChart コンポーネント

```typescript
interface GanttChartProps {
  rows: GanttRow[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBarClick?: (bar: GanttBar) => void;
  onRowLabelClick?: (row: GanttRow) => void;
  labelWidth?: number;  // デフォルト 200px
}
```

**レイアウト構造:**

```
┌──────────────────────────────────────────────┐
│ [凡例: ■完了 ■進行中 □スキップ ┄受注予定月]  [日][週][月] │
├─────────┬────────────────────────────────────┤
│ ラベル列 │ タイムラインヘッダー（スクロール可能）      │
│（固定）  │ 2/24  2/25  2/26  2/27  ...             │
├─────────┼────────────────────────────────────┤
│ ABC商事  │ ████████  ████                           │
│ MG-0001  │         ████████████  ← バー            │
├─────────┼────────────────────────────────────┤
│ DEF工業  │     ████████████████                     │
│ MG-0002  │              │← 今日線（赤）             │
└─────────┴────────────────────────────────────┘
```

**主要な描画要素:**

| 要素 | 実装 |
|------|------|
| ラベル列 | `flex-shrink-0` で固定幅。タイムラインとは独立スクロール |
| タイムラインヘッダー | ビューモードに応じた列ラベル。週末は赤背景（日表示時） |
| バー | パーセントベースの絶対位置配置。ステータス別色分け |
| 今日線 | 赤の縦線 + 「今日」ラベル。パーセントベースで配置 |
| 受注予定月線 | オレンジの点線。月末日の位置に描画 |
| ツールチップ | `fixed` 配置のホバーツールチップ（ステップ名・日付範囲・ステータス） |

**ステータス別バーの色:**

| ステータス | 色 | CSSクラス |
|-----------|-----|-----------|
| `completed` | 緑 | `bg-emerald-500` |
| `started` | 青 | `bg-blue-500` |
| `skipped` | 灰（点線） | `bg-gray-300 border border-dashed border-gray-400` |

### 5.2 初期スクロール位置

ビューモード変更時・初期表示時に今日の位置付近へ自動スクロール:

```typescript
const scrollTarget = (todayPos / 100) * timelineWidth - el.clientWidth / 3;
el.scrollLeft = Math.max(0, scrollTarget);
```

---

## 6. 案件詳細への統合

### 6.1 変更対象

`src/components/features/project/project-movements-tab.tsx`

### 6.2 変更内容

既存のマトリクス表の下にガントチャートを追加:

- データ変換: `toGanttRowsForDetail(movements)` でステップごとの行を生成
- ガントタスクが0件（全て pending）の場合はガントチャート非表示
- バークリック → 既存の `MovementEditModal` を開く
- `onRowLabelClick` は未使用（案件詳細ではステップ名クリックの遷移先がないため）

---

## 7. ムーブメント一覧への統合

### 7.1 変更対象

`src/app/(auth)/movements/_client.tsx`

### 7.2 変更内容

マトリクス表とガントチャートを切替可能にする:

- 表示切替: マトリクス / ガントチャートのトグルボタン
- データ変換: `toGanttRowsForList(response)` で案件ごとの行を生成
- ラベル列: 顧客名 + 案件番号
- ラベルクリック → 案件詳細ページへ遷移
- バークリック → `MovementEditModal` を開く
- 営業ステータスフィルターはマトリクス/ガント両方に適用

---

## 8. 実装チェックリスト

### Step 1: コアコンポーネント — 完了

- [x] `gantt-chart-utils.ts` — データ変換・時間軸計算ロジック
  - [x] `GanttBar` / `GanttRow` / `TimelineColumn` 型定義
  - [x] `toGanttRowsForList()` — 一覧用変換
  - [x] `toGanttRowsForDetail()` — 案件詳細用変換
  - [x] `getDateRange()` — タイムライン範囲算出（受注予定月・今日を含む）
  - [x] `buildDayColumns()` / `buildWeekColumns()` / `buildMonthColumns()` — 列生成
  - [x] `calcBarPosition()` — バー位置計算
  - [x] `getBarColorClasses()` / `getStatusLabel()` — ステータス描画ヘルパー
- [x] `gantt-chart.tsx` — メインコンポーネント
  - [x] ラベル列（固定）+ タイムライン（横スクロール）レイアウト
  - [x] ビューモード切替（日/週/月）
  - [x] ステータス別バー色分け
  - [x] 今日線の描画
  - [x] 受注予定月の目標線
  - [x] ホバーツールチップ
  - [x] バークリック → コールバック
  - [x] 初期スクロール（今日付近）
  - [x] 凡例表示

### Step 2: 案件詳細への統合 — 完了

- [x] `project-movements-tab.tsx` にガントチャートを追加
- [x] マトリクス表の下にタイムラインセクション
- [x] バークリック → `MovementEditModal` 呼び出し
- [x] バーが0件の場合は非表示

### Step 3: ムーブメント一覧への統合 — 完了

- [x] `movements/_client.tsx` に表示切替UI（マトリクス/ガント）を追加
- [x] ラベル列（顧客名 + 案件番号）の表示
- [x] ラベルクリック → 案件詳細ページへ遷移
- [x] バークリック → `MovementEditModal` 呼び出し
- [x] 営業ステータスフィルターとの連携

### Step 4: 動作検証 — 完了

- [x] 日/週/月表示の切替動作
- [x] バーのステータス別色分け（completed=緑, started=青, skipped=灰点線）
- [x] ホバーツールチップの表示内容
- [x] バークリックから編集モーダルの表示
- [x] 全ステップが pending の場合のフォールバック表示
- [x] 横スクロールの動作
- [x] 今日線が常にタイムライン範囲内に表示される
- [x] 受注予定月の目標線がタイムライン範囲内に表示される
