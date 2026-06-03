// ============================================
// 統一ソート基盤 — 型定義
// ============================================
// 全エンティティ共通。列ごとの「並べ方」を1か所(SortSpec)で宣言し、
// 単一エンジン(engine.ts)が DB orderBy / アプリ側ソートを自動選択する。

import type { SortItem, SortDirection } from '@/lib/sort-helper';

export type { SortItem, SortDirection };

/**
 * 列のソート戦略。
 * - db:         単純な DB カラム（Prisma orderBy で処理。ページング維持）
 * - relation:   リレーション越しの DB カラム（例: customer.customerName）
 * - select:     選択肢の定義順で並べる（アプリ側）。order は列の options 由来（単一ソース）
 * - natural:    数値混じり文字列を自然順で並べる（アプリ側）。例: 1-2 < 1-11
 * - status:     営業ステータスの statusSortOrder で並べる（アプリ側）
 * - customData: JSONB カスタムフィールド（アプリ側）。select 型はオプション順
 */
export type SortStrategy =
  | { kind: 'db'; column?: string }
  | { kind: 'relation'; path: readonly string[] }
  | { kind: 'select'; order: readonly string[] }
  | { kind: 'natural' }
  | { kind: 'status' }
  | { kind: 'customData' };

/** フィールドキー → 戦略。ここに無い列は「ソート不可」。 */
export type SortSpec = Record<string, SortStrategy>;

/** アプリ側ソートに必要な実行時コンテキスト（status / customData 用） */
export type AppSortContext = {
  /** status: `${businessId}:${statusCode}` → 並び順 index */
  statusOrder?: Map<string, number>;
  /** customData の select 型: フィールドキー(プレフィックス除去) → 値 → index */
  customSelectOrder?: Map<string, Map<string, number>>;
  /** customData_ プレフィックスの元データ取得（案件カスタム JSONB） */
  getCustomData?: (row: Record<string, unknown>) => Record<string, unknown> | null;
};

const APP_SORT_KINDS = new Set<SortStrategy['kind']>([
  'select',
  'natural',
  'status',
  'customData',
]);

/** その戦略がアプリ側ソート（全件取得が必要）かどうか */
export function isAppSortKind(kind: SortStrategy['kind']): boolean {
  return APP_SORT_KINDS.has(kind);
}
