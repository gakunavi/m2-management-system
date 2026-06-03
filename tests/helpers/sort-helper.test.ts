import { describe, it, expect } from 'vitest';
import {
  isCustomDataSort,
  parseSortParams,
  buildOrderBy,
  getCustomSortPagination,
  applyAppSortAndSlice,
  CUSTOMER_SORT_FIELDS,
  needsListAppSort,
  sortListRecords,
} from '@/lib/sort-helper';

// ============================================
// needsListAppSort / sortListRecords（定義順select・自然順）
// ============================================

describe('needsListAppSort', () => {
  it('種別(customerType/partnerType)と階層番号でtrueを返す', () => {
    expect(needsListAppSort([{ field: 'customerType', direction: 'asc' }])).toBe(true);
    expect(needsListAppSort([{ field: 'partnerType', direction: 'asc' }])).toBe(true);
    expect(needsListAppSort([{ field: 'partnerTierNumber', direction: 'asc' }])).toBe(true);
  });
  it('通常列ではfalseを返す', () => {
    expect(needsListAppSort([{ field: 'customerName', direction: 'asc' }])).toBe(false);
    expect(needsListAppSort([{ field: 'updatedAt', direction: 'desc' }])).toBe(false);
  });
});

describe('sortListRecords', () => {
  it('種別(select)を定義順で並べる（法人→個人事業主→個人）', () => {
    const rows = [
      { id: 1, customerType: '個人事業主' },
      { id: 2, customerType: '個人' },
      { id: 3, customerType: '法人' },
    ];
    const asc = sortListRecords(rows, [{ field: 'customerType', direction: 'asc' }]);
    expect(asc.map((r) => r.id)).toEqual([3, 1, 2]);
    const desc = sortListRecords(rows, [{ field: 'customerType', direction: 'desc' }]);
    expect(desc.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('階層番号を自然順で並べる（1-2 が 1-11 より前）', () => {
    const rows = [
      { id: 1, partnerTierNumber: '1-11' },
      { id: 2, partnerTierNumber: '1-2' },
      { id: 3, partnerTierNumber: '2' },
    ];
    const asc = sortListRecords(rows, [{ field: 'partnerTierNumber', direction: 'asc' }]);
    expect(asc.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('複数キー（種別→顧客名）で並べる', () => {
    const rows = [
      { id: 1, customerType: '法人', customerName: 'ビ' },
      { id: 2, customerType: '個人事業主', customerName: 'ア' },
      { id: 3, customerType: '法人', customerName: 'ア' },
    ];
    const sorted = sortListRecords(rows, [
      { field: 'customerType', direction: 'asc' },
      { field: 'customerName', direction: 'asc' },
    ]);
    expect(sorted.map((r) => r.id)).toEqual([3, 1, 2]);
  });
});

// ============================================
// isCustomDataSort
// ============================================

describe('isCustomDataSort', () => {
  it('customData_ プレフィックスを検知する', () => {
    expect(isCustomDataSort('customData_estimatedRevenue')).toBe(true);
    expect(isCustomDataSort('customData_closeMonth')).toBe(true);
  });

  it('通常フィールドは false', () => {
    expect(isCustomDataSort('customerName')).toBe(false);
    expect(isCustomDataSort('updatedAt')).toBe(false);
    expect(isCustomDataSort('custom_data_field')).toBe(false);
  });
});

// ============================================
// parseSortParams
// ============================================

describe('parseSortParams', () => {
  it('新形式: sort=field:direction をパースする', () => {
    const params = new URLSearchParams('sort=customerName:asc');
    const result = parseSortParams(params, 'id');
    expect(result).toEqual([{ field: 'customerName', direction: 'asc' }]);
  });

  it('複数列ソートをパースする', () => {
    const params = new URLSearchParams('sort=customerName:asc,updatedAt:desc');
    const result = parseSortParams(params, 'id');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ field: 'customerName', direction: 'asc' });
    expect(result[1]).toEqual({ field: 'updatedAt', direction: 'desc' });
  });

  it('不正な direction は asc にフォールバック', () => {
    const params = new URLSearchParams('sort=customerName:invalid');
    const result = parseSortParams(params, 'id');
    expect(result[0].direction).toBe('asc');
  });

  it('後方互換: sortField/sortDirection をパースする', () => {
    const params = new URLSearchParams('sortField=customerName&sortDirection=desc');
    const result = parseSortParams(params, 'id');
    expect(result).toEqual([{ field: 'customerName', direction: 'desc' }]);
  });

  it('パラメータなしの場合はデフォルト', () => {
    const params = new URLSearchParams('');
    const result = parseSortParams(params, 'customerCode', 'desc');
    expect(result).toEqual([{ field: 'customerCode', direction: 'desc' }]);
  });

  it('デフォルト direction は asc', () => {
    const params = new URLSearchParams('');
    const result = parseSortParams(params, 'id');
    expect(result[0].direction).toBe('asc');
  });
});

// ============================================
// buildOrderBy
// ============================================

describe('buildOrderBy', () => {
  const allowedFields = CUSTOMER_SORT_FIELDS;
  const defaultSort = [{ field: 'customerCode', direction: 'asc' as const }];

  it('許可フィールドのみ通す', () => {
    const items = [
      { field: 'customerName', direction: 'asc' as const },
      { field: 'malicious', direction: 'desc' as const },
    ];
    const result = buildOrderBy(items, allowedFields, defaultSort);
    expect(result).toEqual([{ customerName: 'asc' }]);
  });

  it('customData_ フィールドは除外する', () => {
    const items = [{ field: 'customData_revenue', direction: 'desc' as const }];
    const result = buildOrderBy(items, allowedFields, defaultSort);
    // customData ソートの場合は空配列（アプリ側ソートに委譲）
    expect(result).toEqual([]);
  });

  it('全フィールド不正の場合はデフォルトにフォールバック', () => {
    const items = [{ field: 'invalidField', direction: 'asc' as const }];
    const result = buildOrderBy(items, allowedFields, defaultSort);
    expect(result).toEqual([{ customerCode: 'asc' }]);
  });

  it('複数有効フィールドを Prisma orderBy 形式に変換', () => {
    const items = [
      { field: 'customerName', direction: 'asc' as const },
      { field: 'updatedAt', direction: 'desc' as const },
    ];
    const result = buildOrderBy(items, allowedFields, defaultSort);
    expect(result).toEqual([
      { customerName: 'asc' },
      { updatedAt: 'desc' },
    ]);
  });
});

// ============================================
// getCustomSortPagination
// ============================================

describe('getCustomSortPagination', () => {
  it('カスタムフィールドソートでは全件取得モード', () => {
    const items = [{ field: 'customData_revenue', direction: 'desc' as const }];
    const result = getCustomSortPagination(items, 20, 10);
    expect(result).toEqual({ skip: 0, take: undefined, needsAppSort: true });
  });

  it('通常ソートでは元のページネーションを維持', () => {
    const items = [{ field: 'customerName', direction: 'asc' as const }];
    const result = getCustomSortPagination(items, 20, 10);
    expect(result).toEqual({ skip: 20, take: 10, needsAppSort: false });
  });
});

// ============================================
// applyAppSortAndSlice
// ============================================

describe('applyAppSortAndSlice', () => {
  type TestRecord = { id: number; projectCustomData: Record<string, unknown> | null };

  const records: TestRecord[] = [
    { id: 1, projectCustomData: { revenue: 300 } },
    { id: 2, projectCustomData: { revenue: 100 } },
    { id: 3, projectCustomData: { revenue: 500 } },
    { id: 4, projectCustomData: { revenue: 200 } },
    { id: 5, projectCustomData: { revenue: 400 } },
  ];

  const getCustomData = (r: TestRecord) => r.projectCustomData;

  it('カスタムフィールドで昇順ソート + スライス', () => {
    const sortItems = [{ field: 'customData_revenue', direction: 'asc' as const }];
    const result = applyAppSortAndSlice(records, sortItems, getCustomData, 0, 3);
    expect(result.map((r) => r.id)).toEqual([2, 4, 1]); // 100, 200, 300
  });

  it('カスタムフィールドで降順ソート', () => {
    const sortItems = [{ field: 'customData_revenue', direction: 'desc' as const }];
    const result = applyAppSortAndSlice(records, sortItems, getCustomData, 0, 5);
    expect(result.map((r) => r.id)).toEqual([3, 5, 1, 4, 2]); // 500, 400, 300, 200, 100
  });

  it('skip + take でページネーションスライス', () => {
    const sortItems = [{ field: 'customData_revenue', direction: 'asc' as const }];
    const result = applyAppSortAndSlice(records, sortItems, getCustomData, 2, 2);
    expect(result.map((r) => r.id)).toEqual([1, 5]); // 300, 400
  });

  it('null 値は末尾に配置される', () => {
    const recordsWithNull: TestRecord[] = [
      { id: 1, projectCustomData: { revenue: 200 } },
      { id: 2, projectCustomData: null },
      { id: 3, projectCustomData: { revenue: 100 } },
    ];
    const sortItems = [{ field: 'customData_revenue', direction: 'asc' as const }];
    const result = applyAppSortAndSlice(recordsWithNull, sortItems, getCustomData, 0, 3);
    expect(result.map((r) => r.id)).toEqual([3, 1, 2]); // 100, 200, null
  });

  it('カスタムフィールドソートなしの場合は元の順序を維持', () => {
    const sortItems = [{ field: 'customerName', direction: 'asc' as const }];
    const result = applyAppSortAndSlice(records, sortItems, getCustomData, 0, 3);
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]); // 元の順序
  });

  it('文字列フィールドのソート', () => {
    const strRecords: TestRecord[] = [
      { id: 1, projectCustomData: { name: 'ベータ' } },
      { id: 2, projectCustomData: { name: 'アルファ' } },
      { id: 3, projectCustomData: { name: 'ガンマ' } },
    ];
    const sortItems = [{ field: 'customData_name', direction: 'asc' as const }];
    const result = applyAppSortAndSlice(strRecords, sortItems, getCustomData, 0, 3);
    expect(result.map((r) => r.id)).toEqual([2, 3, 1]); // アルファ, ガンマ, ベータ（五十音順）
  });
});
