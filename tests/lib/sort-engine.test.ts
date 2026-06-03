import { describe, it, expect } from 'vitest';
import {
  resolveSort,
  applyAppSort,
  withCustomDataFields,
} from '@/lib/sort/engine';
import type { SortSpec } from '@/lib/sort/types';

const SPEC: SortSpec = {
  name: { kind: 'db' },
  code: { kind: 'natural' },
  type: { kind: 'select', order: ['法人', '個人事業主', '個人'] },
  custName: { kind: 'relation', path: ['customer', 'customerName'] },
  status: { kind: 'status' },
};

describe('resolveSort', () => {
  it('db列のみ → prismaOrderBy を構築し needsAppSort=false', () => {
    const r = resolveSort([{ field: 'name', direction: 'asc' }], SPEC);
    expect(r.prismaOrderBy).toEqual([{ name: 'asc' }]);
    expect(r.needsAppSort).toBe(false);
  });

  it('relation列 → ネスト orderBy', () => {
    const r = resolveSort([{ field: 'custName', direction: 'desc' }], SPEC);
    expect(r.prismaOrderBy).toEqual([{ customer: { customerName: 'desc' } }]);
    expect(r.needsAppSort).toBe(false);
  });

  it('select/natural/status を含む → needsAppSort=true', () => {
    expect(resolveSort([{ field: 'type', direction: 'asc' }], SPEC).needsAppSort).toBe(true);
    expect(resolveSort([{ field: 'code', direction: 'asc' }], SPEC).needsAppSort).toBe(true);
    expect(resolveSort([{ field: 'status', direction: 'asc' }], SPEC).needsAppSort).toBe(true);
  });

  it('spec に無いフィールドは除外される', () => {
    const r = resolveSort(
      [
        { field: 'unknown', direction: 'asc' },
        { field: 'name', direction: 'asc' },
      ],
      SPEC,
    );
    expect(r.appSortItems).toEqual([{ field: 'name', direction: 'asc' }]);
  });
});

describe('applyAppSort', () => {
  it('select を定義順で並べる', () => {
    const rows = [
      { id: 1, type: '個人' },
      { id: 2, type: '法人' },
      { id: 3, type: '個人事業主' },
    ];
    const asc = applyAppSort(rows, [{ field: 'type', direction: 'asc' }], SPEC);
    expect(asc.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('natural を自然順で並べる（1-2 < 1-11）', () => {
    const rows = [
      { id: 1, code: '1-11' },
      { id: 2, code: '1-2' },
      { id: 3, code: '2' },
    ];
    const asc = applyAppSort(rows, [{ field: 'code', direction: 'asc' }], SPEC);
    expect(asc.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('status を statusSortOrder で並べ、同点は第2キーで決まる（合成）', () => {
    const statusOrder = new Map<string, number>([
      ['1:見込', 0],
      ['1:受注', 1],
    ]);
    const rows = [
      { id: 1, businessId: 1, status: '受注', name: 'A' },
      { id: 2, businessId: 1, status: '見込', name: 'B' },
      { id: 3, businessId: 1, status: '見込', name: 'A' },
    ];
    const sorted = applyAppSort(
      rows,
      [
        { field: 'status', direction: 'asc' },
        { field: 'name', direction: 'asc' },
      ],
      SPEC,
      { statusOrder },
    );
    // 見込(A=3, B=2) → 受注(1)
    expect(sorted.map((r) => r.id)).toEqual([3, 2, 1]);
  });
});

describe('withCustomDataFields', () => {
  it('customData プレフィックスのソート項目を spec に補完する', () => {
    const merged = withCustomDataFields(SPEC, [
      { field: 'customData_x', direction: 'asc' },
      { field: 'customerLink_y', direction: 'asc' },
      { field: 'name', direction: 'asc' },
    ]);
    expect(merged.customData_x).toEqual({ kind: 'customData' });
    expect(merged.customerLink_y).toEqual({ kind: 'customData' });
    expect(merged.name).toEqual({ kind: 'db' });
  });

  it('該当が無ければ同一参照を返す', () => {
    const merged = withCustomDataFields(SPEC, [{ field: 'name', direction: 'asc' }]);
    expect(merged).toBe(SPEC);
  });
});
