import { describe, it, expect } from 'vitest';
import {
  MOVEMENT_CORE_SORT_OPTIONS,
  buildMovementSortOptions,
  compareMovementSortValues,
  resolveMovementDefaultSort,
  toCustomFieldKey,
  toCustomSortKey,
} from '@/lib/movement-sort';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';

const FIELDS: EntityFieldDefinition[] = [
  { key: 'contract_date', label: '契約日', type: 'date', sortOrder: 2, showOnMovement: true },
  { key: 'units', label: '台数', type: 'number', sortOrder: 1, showOnMovement: true },
  { key: 'memo', label: '社内メモ', type: 'text', sortOrder: 0 },
];

describe('buildMovementSortOptions', () => {
  it('コア項目＋ showOnMovement の項目のみを sortOrder 順で返す', () => {
    const options = buildMovementSortOptions(FIELDS);
    expect(options.map((o) => o.key)).toEqual([
      ...MOVEMENT_CORE_SORT_OPTIONS.map((o) => o.key),
      'custom_units',
      'custom_contract_date',
    ]);
    // 表示していない項目は候補に出さない（何順か画面から分からなくなるため）
    expect(options.some((o) => o.key === 'custom_memo')).toBe(false);
  });
});

describe('キー変換', () => {
  it('往復する', () => {
    expect(toCustomFieldKey(toCustomSortKey('contract_date'))).toBe('contract_date');
  });
  it('コア項目は null', () => {
    expect(toCustomFieldKey('projectExpectedCloseMonth')).toBeNull();
  });
});

describe('resolveMovementDefaultSort', () => {
  const options = buildMovementSortOptions(FIELDS);

  it('候補にあるキーはそのまま返す', () => {
    expect(resolveMovementDefaultSort({ key: 'custom_contract_date', direction: 'desc' }, options))
      .toEqual({ key: 'custom_contract_date', direction: 'desc' });
  });

  it('direction 未指定は昇順', () => {
    expect(resolveMovementDefaultSort({ key: 'customerName' }, options))
      .toEqual({ key: 'customerName', direction: 'asc' });
  });

  it('候補から外れたキー（表示を外した項目）は無視する', () => {
    expect(resolveMovementDefaultSort({ key: 'custom_memo', direction: 'asc' }, options)).toBeNull();
  });

  it('未設定・不正値は null', () => {
    expect(resolveMovementDefaultSort(null, options)).toBeNull();
    expect(resolveMovementDefaultSort({}, options)).toBeNull();
    expect(resolveMovementDefaultSort('asc', options)).toBeNull();
  });
});

describe('compareMovementSortValues', () => {
  it('数値は数値として比較する（文字列比較だと 10 < 9 になる）', () => {
    expect(compareMovementSortValues(10, 9, 'number', 'asc')).toBeGreaterThan(0);
    expect(compareMovementSortValues('10', '9', 'number', 'asc')).toBeGreaterThan(0);
  });

  it('日付は ISO 文字列の辞書順', () => {
    expect(compareMovementSortValues('2026-01-05', '2026-02-01', 'date', 'asc')).toBeLessThan(0);
    expect(compareMovementSortValues('2026-01-05', '2026-02-01', 'date', 'desc')).toBeGreaterThan(0);
  });

  it('空値は昇順・降順とも常に末尾', () => {
    expect(compareMovementSortValues(null, '2026-01-01', 'date', 'asc')).toBeGreaterThan(0);
    expect(compareMovementSortValues(null, '2026-01-01', 'date', 'desc')).toBeGreaterThan(0);
    expect(compareMovementSortValues('2026-01-01', '', 'date', 'desc')).toBeLessThan(0);
    expect(compareMovementSortValues(null, undefined, 'date', 'asc')).toBe(0);
  });

  it('チェックボックスは未チェックが先', () => {
    expect(compareMovementSortValues(true, false, 'checkbox', 'asc')).toBeGreaterThan(0);
  });
});
