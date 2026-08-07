import { z } from 'zod';

// ============================================
// 一覧の列設定 / 保存済みビューの共通バリデーションスキーマ
// ============================================
// グローバル設定（user-preferences/table）と保存済みビュー（saved-views）で
// 同じ列設定（PersistedColumnSettings）を保存するため、スキーマを共有する。
// 別々に定義すると片方に新フィールドを足し忘れ、zod がそのキーを黙って
// 削除する（= 保存したはずの設定が消える）事故になる。
// 実際に columnPinning が saved-views 側だけ欠けており、
// ビュー選択中の列固定がPATCH応答で毎回解除されていた。
//
// 新しい列設定を追加する場合は必ずここに追加すること。
// tests/lib/table-settings-schema.test.ts にドリフト検知あり。

const sortItemSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']),
});

/** PersistedColumnSettings（src/types/config.ts）に対応 */
export const persistedColumnSettingsSchema = z.object({
  columnOrder: z.array(z.string()).default([]),
  columnVisibility: z.record(z.string(), z.boolean()).default({}),
  columnWidths: z.record(z.string(), z.number()).default({}),
  sortState: z.array(sortItemSchema).default([]),
  /** 左固定列（列のピン留め） */
  columnPinning: z.object({ left: z.array(z.string()) }).optional(),
  /** 1ページあたりの表示件数 */
  pageSize: z.number().int().min(1).max(200).optional(),
});

/** SavedViewSettings（src/types/config.ts）に対応 */
export const savedViewSettingsSchema = z.object({
  columnSettings: persistedColumnSettingsSchema,
  filters: z.record(z.string(), z.string()).default({}),
  sortItems: z.array(sortItemSchema).default([]),
  searchQuery: z.string().default(''),
  pageSize: z.number().int().min(1).max(200).default(25),
});
