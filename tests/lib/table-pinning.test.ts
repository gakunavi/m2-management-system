import { describe, it, expect } from 'vitest';
import {
  computeFrozenLayout,
  withPinnedFirst,
  type FrozenColumn,
} from '@/lib/table-pinning';

// ============================================
// 列固定（フリーズペイン）のレイアウト計算
// 旧実装は固定列の幅だけで left を求めていたため、
// プレフィックス列やピン列より左の通常列が sticky 列の下に潜り込んで消えていた。
// ============================================

const ORDER = ['_select', '_open', 'customerName', 'phone', 'address', 'note'];

/** 表示順（withPinnedFirst 適用後）の列リストを作る */
const colsFor = (order: string[], sizes: Record<string, number>): FrozenColumn[] =>
  order.map((id) => ({ id, size: sizes[id] ?? 120 }));

const SIZES: Record<string, number> = {
  _select: 36,
  _open: 36,
  customerName: 180,
  phone: 140,
  address: 200,
  note: 120,
};

describe('withPinnedFirst', () => {
  it('固定が無ければ並び順を変えない', () => {
    expect(withPinnedFirst(ORDER, [])).toEqual(ORDER);
  });

  it('固定列をプレフィックス列の直後へ寄せる', () => {
    expect(withPinnedFirst(ORDER, ['address'])).toEqual([
      '_select',
      '_open',
      'address',
      'customerName',
      'phone',
      'note',
    ]);
  });

  it('複数固定はピン留めした順に左から並ぶ', () => {
    expect(withPinnedFirst(ORDER, ['address', 'customerName'])).toEqual([
      '_select',
      '_open',
      'address',
      'customerName',
      'phone',
      'note',
    ]);
  });

  it('存在しない列IDが混ざっても落ちない・重複しない', () => {
    const result = withPinnedFirst(ORDER, ['deletedCol', 'phone']);
    expect(result).toEqual(['_select', '_open', 'phone', 'customerName', 'address', 'note']);
    expect(new Set(result).size).toBe(result.length);
  });

  it('列の増減が起きない（欠落・重複の検出）', () => {
    const result = withPinnedFirst(ORDER, ['note', 'phone']);
    expect([...result].sort()).toEqual([...ORDER].sort());
  });
});

describe('computeFrozenLayout', () => {
  it('固定が無ければ sticky にしない', () => {
    const layout = computeFrozenLayout(colsFor(ORDER, SIZES), []);
    expect(layout).toEqual({ offsets: {}, lastId: null });
  });

  it('プレフィックス列を含めて左から幅を積み上げる', () => {
    const order = withPinnedFirst(ORDER, ['customerName']);
    const layout = computeFrozenLayout(colsFor(order, SIZES), ['customerName']);

    // _select(36) → _open(36) → customerName
    expect(layout.offsets).toEqual({
      _select: 0,
      _open: 36,
      customerName: 72,
    });
    // 固定ブロックの右端にだけ境界の影を出す
    expect(layout.lastId).toBe('customerName');
  });

  it('固定列が重ならない（left が必ず前列の右端以降になる）', () => {
    const pinned = ['address', 'customerName'];
    const order = withPinnedFirst(ORDER, pinned);
    const cols = colsFor(order, SIZES);
    const layout = computeFrozenLayout(cols, pinned);

    const frozenIds = ['_select', '_open', 'address', 'customerName'];
    let expectedLeft = 0;
    for (const id of frozenIds) {
      expect(layout.offsets[id]).toBe(expectedLeft);
      expectedLeft += SIZES[id];
    }
    // 固定していない列は sticky にしない（通常どおりスクロールする）
    expect(layout.offsets.phone).toBeUndefined();
    expect(layout.offsets.note).toBeUndefined();
  });

  it('非表示の固定列は詰めて計算する', () => {
    const pinned = ['address', 'customerName'];
    const order = withPinnedFirst(ORDER, pinned).filter((id) => id !== 'address');
    const layout = computeFrozenLayout(colsFor(order, SIZES), pinned);

    expect(layout.offsets).toEqual({ _select: 0, _open: 36, customerName: 72 });
    expect(layout.lastId).toBe('customerName');
  });

  it('選択列が無い一覧（_open のみ）でも正しく積み上げる', () => {
    const order = withPinnedFirst(
      ['_open', 'customerName', 'phone'],
      ['phone'],
    );
    expect(order).toEqual(['_open', 'phone', 'customerName']);

    const layout = computeFrozenLayout(colsFor(order, SIZES), ['phone']);
    expect(layout.offsets).toEqual({ _open: 0, phone: 36 });
    expect(layout.lastId).toBe('phone');
  });

  it('列幅変更が left に反映される', () => {
    const pinned = ['customerName'];
    const order = withPinnedFirst(ORDER, pinned);
    const widened = { ...SIZES, _select: 50 };
    const layout = computeFrozenLayout(colsFor(order, widened), pinned);

    expect(layout.offsets.customerName).toBe(50 + 36);
  });
});
