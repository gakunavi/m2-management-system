import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeViewFilters } from '@/lib/view-filters';

const STANDARD = { projectSalesStatus: 'purchased,applying,informal_approval' };

describe('mergeViewFilters', () => {
  it('両方空なら空', () => {
    expect(mergeViewFilters({}, {})).toEqual({});
    expect(mergeViewFilters(null, null)).toEqual({});
    expect(mergeViewFilters(undefined, undefined)).toEqual({});
  });

  it('既定が無ければビューの内容をそのまま返す', () => {
    expect(mergeViewFilters({ portalVisible: 'true' }, {})).toEqual({ portalVisible: 'true' });
    expect(mergeViewFilters({ portalVisible: 'true' }, undefined)).toEqual({ portalVisible: 'true' });
  });

  it('本件の再現: filters が空のビューには既定を補う', () => {
    // 本番のデフォルトビュー「メイン」は filters:{} で保存されており、
    // これをそのまま適用すると失注除外の標準フィルタが消えていた
    expect(mergeViewFilters({}, STANDARD)).toEqual(STANDARD);
  });

  it('ビューが同じキーを持つ場合はビューが勝つ', () => {
    expect(mergeViewFilters({ projectSalesStatus: 'lost' }, STANDARD)).toEqual({
      projectSalesStatus: 'lost',
    });
  });

  it('ビューが空文字を持つ場合もビューの値として尊重する', () => {
    expect(mergeViewFilters({ projectSalesStatus: '' }, STANDARD)).toEqual({
      projectSalesStatus: '',
    });
  });

  it('キーが異なる場合は両方が残る', () => {
    expect(mergeViewFilters({ portalVisible: 'true' }, STANDARD)).toEqual({
      ...STANDARD,
      portalVisible: 'true',
    });
  });

  it('入力オブジェクトを変更しない（イミュータブル）', () => {
    const view = { portalVisible: 'true' };
    const defaults = { ...STANDARD };
    mergeViewFilters(view, defaults);
    expect(view).toEqual({ portalVisible: 'true' });
    expect(defaults).toEqual(STANDARD);
  });

  it('戻り値は入力と同一参照ではない', () => {
    const view = { portalVisible: 'true' };
    expect(mergeViewFilters(view, {})).not.toBe(view);
  });
});

// ============================================
// ドリフト検知
// ============================================
// ビュー適用時に setFilters(s.filters) へ戻すと、空 filters の古いビューが
// 標準フィルタを打ち消す不具合が再発する。
describe('EntityListTemplate のビュー適用', () => {
  const source = readFileSync(
    join(__dirname, '../../src/components/templates/entity-list-template.tsx'),
    'utf-8',
  );

  it('applyViewState が mergeViewFilters を経由している', () => {
    expect(source).toContain('mergeViewFilters(s.filters');
  });

  it('ビューの filters を素通しで setFilters していない', () => {
    expect(source).not.toContain('setFilters(s.filters)');
  });
});
