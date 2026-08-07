import { describe, it, expect } from 'vitest';
import {
  persistedColumnSettingsSchema,
  savedViewSettingsSchema,
} from '@/lib/table-settings-schema';
import type { PersistedColumnSettings, SavedViewSettings } from '@/types/config';

// ============================================
// ドリフト防止: 列設定のフィールドが zod に黙って削除されないこと
// （saved-views 側だけ columnPinning が欠けており、ビュー選択中の列固定が
//   PATCH のレスポンスで毎回解除される不具合が発生していた）
// ============================================

const FULL_COLUMN_SETTINGS: Required<PersistedColumnSettings> = {
  columnOrder: ['_open', 'customerName', 'phone'],
  columnVisibility: { customerName: true, phone: false },
  columnWidths: { customerName: 180 },
  sortState: [{ field: 'customerName', direction: 'asc' }],
  columnPinning: { left: ['customerName'] },
  pageSize: 50,
};

const FULL_VIEW_SETTINGS: SavedViewSettings = {
  columnSettings: FULL_COLUMN_SETTINGS,
  filters: { status: 'active' },
  sortItems: [{ field: 'customerName', direction: 'asc' }],
  searchQuery: 'テスト',
  pageSize: 50,
};

describe('列設定スキーマのドリフト防止', () => {
  it('PersistedColumnSettings の全フィールドが user-preferences 用スキーマを通過する', () => {
    const parsed = persistedColumnSettingsSchema.parse(FULL_COLUMN_SETTINGS);
    expect(parsed).toEqual(FULL_COLUMN_SETTINGS);
  });

  it('保存済みビューでも列固定・表示件数が保持される', () => {
    const parsed = savedViewSettingsSchema.parse(FULL_VIEW_SETTINGS);
    expect(parsed.columnSettings.columnPinning).toEqual({ left: ['customerName'] });
    expect(parsed.columnSettings.pageSize).toBe(50);
    expect(parsed).toEqual(FULL_VIEW_SETTINGS);
  });

  it('型定義に増えたフィールドがスキーマ側で欠落していない', () => {
    // PersistedColumnSettings のキーを網羅したオブジェクトを parse した結果と
    // 入力のキー集合が一致すること（= zod が黙って捨てたキーが無いこと）
    const parsed = persistedColumnSettingsSchema.parse(FULL_COLUMN_SETTINGS);
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(FULL_COLUMN_SETTINGS).sort());

    const parsedView = savedViewSettingsSchema.parse(FULL_VIEW_SETTINGS);
    expect(Object.keys(parsedView).sort()).toEqual(Object.keys(FULL_VIEW_SETTINGS).sort());
    expect(Object.keys(parsedView.columnSettings).sort()).toEqual(
      Object.keys(FULL_COLUMN_SETTINGS).sort(),
    );
  });

  it('表示件数の上限(100)まで保存できる', () => {
    expect(() =>
      savedViewSettingsSchema.parse({ ...FULL_VIEW_SETTINGS, pageSize: 100 }),
    ).not.toThrow();
  });
});
