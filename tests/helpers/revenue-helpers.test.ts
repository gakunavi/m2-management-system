import { describe, it, expect } from 'vitest';
import {
  getFiscalYearMonths,
  getCurrentFiscalYear,
  getCurrentMonth,
  getPreviousMonth,
  getMonthLabel,
  getRevenueMonth,
  getRevenueAmount,
  getKpiDefinitions,
  getKpiDefinition,
  getPrimaryKpiDefinition,
  resolveUnitsField,
  getUnitsValue,
  getRevenueRecognition,
} from '@/lib/revenue-helpers';

// ============================================
// 年度ヘルパー
// ============================================

describe('getFiscalYearMonths', () => {
  it('年度の12ヶ月配列を返す（4月始まり）', () => {
    const months = getFiscalYearMonths(2025);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-04');
    expect(months[8]).toBe('2025-12');
    expect(months[9]).toBe('2026-01');
    expect(months[11]).toBe('2026-03');
  });

  it('異なる年度でも正しく計算する', () => {
    const months = getFiscalYearMonths(2020);
    expect(months[0]).toBe('2020-04');
    expect(months[11]).toBe('2021-03');
  });
});

describe('getCurrentFiscalYear', () => {
  it('現在の年度を返す', () => {
    const year = getCurrentFiscalYear();
    // 3月 = 前年度、4月以降 = 当年度
    const now = new Date();
    const expected = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    expect(year).toBe(expected);
  });
});

describe('getCurrentMonth', () => {
  it('YYYY-MM 形式で返す', () => {
    const month = getCurrentMonth();
    expect(month).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('getPreviousMonth', () => {
  it('通常月の前月を返す', () => {
    expect(getPreviousMonth('2025-06')).toBe('2025-05');
    expect(getPreviousMonth('2025-12')).toBe('2025-11');
  });

  it('1月の前月は前年12月', () => {
    expect(getPreviousMonth('2025-01')).toBe('2024-12');
  });
});

describe('getMonthLabel', () => {
  it('月ラベルを生成する', () => {
    expect(getMonthLabel('2025-04')).toBe('4月');
    expect(getMonthLabel('2025-12')).toBe('12月');
    expect(getMonthLabel('2026-01')).toBe('1月');
  });
});

// ============================================
// 売上計上ヘルパー
// ============================================

describe('getRevenueMonth', () => {
  const baseProject = {
    id: 1,
    projectExpectedCloseMonth: '2025-06',
    projectCustomData: {
      closeMonth: '2025-07',
      closeDate: '2025-08-15',
      invalidField: 12345,
    },
  };

  it('projectExpectedCloseMonth を取得する', () => {
    expect(getRevenueMonth(baseProject, 'projectExpectedCloseMonth')).toBe('2025-06');
  });

  it('カスタムフィールドの month 型を取得する', () => {
    expect(getRevenueMonth(baseProject, 'closeMonth')).toBe('2025-07');
  });

  it('カスタムフィールドの date 型を YYYY-MM に変換する', () => {
    expect(getRevenueMonth(baseProject, 'closeDate')).toBe('2025-08');
  });

  it('数値型フィールドは null を返す', () => {
    expect(getRevenueMonth(baseProject, 'invalidField')).toBeNull();
  });

  it('存在しないフィールドは null を返す', () => {
    expect(getRevenueMonth(baseProject, 'nonExistent')).toBeNull();
  });

  it('projectExpectedCloseMonth が null の場合', () => {
    const project = { ...baseProject, projectExpectedCloseMonth: null };
    expect(getRevenueMonth(project, 'projectExpectedCloseMonth')).toBeNull();
  });

  it('projectCustomData が null の場合', () => {
    const project = { ...baseProject, projectCustomData: null };
    expect(getRevenueMonth(project, 'closeMonth')).toBeNull();
  });
});

describe('getRevenueAmount', () => {
  it('カスタムフィールドの数値を取得する', () => {
    const project = { id: 1, projectExpectedCloseMonth: null, projectCustomData: { amount: 1000000 } };
    expect(getRevenueAmount(project, 'amount')).toBe(1000000);
  });

  it('フィールドが存在しない場合は 0', () => {
    const project = { id: 1, projectExpectedCloseMonth: null, projectCustomData: {} };
    expect(getRevenueAmount(project, 'amount')).toBe(0);
  });

  it('値が文字列の場合は 0', () => {
    const project = { id: 1, projectExpectedCloseMonth: null, projectCustomData: { amount: 'abc' } };
    expect(getRevenueAmount(project, 'amount')).toBe(0);
  });

  it('projectCustomData が null の場合は 0', () => {
    const project = { id: 1, projectExpectedCloseMonth: null, projectCustomData: null };
    expect(getRevenueAmount(project, 'amount')).toBe(0);
  });
});

// ============================================
// KPI 定義ヘルパー
// ============================================

describe('getRevenueRecognition', () => {
  it('正しい設定から RevenueRecognition を返す', () => {
    const config = {
      revenueRecognition: {
        statusCode: 'won',
        amountField: 'estimatedRevenue',
        dateField: 'projectExpectedCloseMonth',
      },
    };
    const result = getRevenueRecognition(config);
    expect(result).toEqual({
      statusCode: 'won',
      amountField: 'estimatedRevenue',
      dateField: 'projectExpectedCloseMonth',
    });
  });

  it('設定がない場合は null', () => {
    expect(getRevenueRecognition({})).toBeNull();
    expect(getRevenueRecognition(null)).toBeNull();
  });

  it('不完全な設定の場合は null', () => {
    expect(getRevenueRecognition({ revenueRecognition: { statusCode: 'won' } })).toBeNull();
  });
});

describe('getKpiDefinitions', () => {
  const kpiDefs = [
    { key: 'count', label: '件数', unit: '件', aggregation: 'count', sourceField: '', statusFilter: 'won', dateField: 'projectExpectedCloseMonth', isPrimary: false, sortOrder: 1 },
    { key: 'revenue', label: '売上', unit: '円', aggregation: 'sum', sourceField: 'amount', statusFilter: 'won', dateField: 'projectExpectedCloseMonth', isPrimary: true, sortOrder: 0 },
  ];

  it('kpiDefinitions がある場合は sortOrder 順で返す', () => {
    const result = getKpiDefinitions({ kpiDefinitions: kpiDefs });
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('revenue'); // sortOrder: 0
    expect(result[1].key).toBe('count');   // sortOrder: 1
  });

  it('旧 revenueRecognition からフォールバック変換する', () => {
    const config = {
      revenueRecognition: {
        statusCode: 'won',
        amountField: 'estimatedRevenue',
        dateField: 'projectExpectedCloseMonth',
      },
    };
    const result = getKpiDefinitions(config);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('revenue');
    expect(result[0].aggregation).toBe('sum');
    expect(result[0].isPrimary).toBe(true);
  });

  it('設定がない場合は空配列', () => {
    expect(getKpiDefinitions({})).toEqual([]);
    expect(getKpiDefinitions(null)).toEqual([]);
  });
});

describe('getKpiDefinition', () => {
  const config = {
    kpiDefinitions: [
      { key: 'revenue', label: '売上', unit: '円', aggregation: 'sum', sourceField: 'amount', statusFilter: 'won', dateField: 'projectExpectedCloseMonth', isPrimary: true, sortOrder: 0 },
      { key: 'count', label: '件数', unit: '件', aggregation: 'count', sourceField: '', statusFilter: 'won', dateField: 'projectExpectedCloseMonth', isPrimary: false, sortOrder: 1 },
    ],
  };

  it('キーで KPI 定義を取得する', () => {
    const result = getKpiDefinition(config, 'revenue');
    expect(result?.key).toBe('revenue');
  });

  it('存在しないキーは null', () => {
    expect(getKpiDefinition(config, 'nonExistent')).toBeNull();
  });
});

describe('getPrimaryKpiDefinition', () => {
  it('isPrimary の KPI を返す', () => {
    const config = {
      kpiDefinitions: [
        { key: 'count', label: '件数', unit: '件', aggregation: 'count', sourceField: '', statusFilter: 'won', dateField: 'd', isPrimary: false, sortOrder: 1 },
        { key: 'revenue', label: '売上', unit: '円', aggregation: 'sum', sourceField: 'a', statusFilter: 'won', dateField: 'd', isPrimary: true, sortOrder: 0 },
      ],
    };
    const result = getPrimaryKpiDefinition(config);
    expect(result?.key).toBe('revenue');
  });

  it('isPrimary がない場合は最初の要素（sortOrder順）', () => {
    const config = {
      kpiDefinitions: [
        { key: 'b', label: 'B', unit: '', aggregation: 'count' as const, sourceField: '', statusFilter: '', dateField: 'd', isPrimary: false, sortOrder: 1 },
        { key: 'a', label: 'A', unit: '', aggregation: 'count' as const, sourceField: '', statusFilter: '', dateField: 'd', isPrimary: false, sortOrder: 0 },
      ],
    };
    const result = getPrimaryKpiDefinition(config);
    expect(result?.key).toBe('a'); // sortOrder: 0 が先頭
  });

  it('KPI がない場合は null', () => {
    expect(getPrimaryKpiDefinition({})).toBeNull();
  });
});

// ============================================
// 台数フィールドの解決
// ============================================
//
// ダッシュボードの案件別内訳と経営統計API（strategy-report）が同じ値を出す必要が
// あるため、解決規則をここで固定しておく。

describe('resolveUnitsField', () => {
  const fields = (...keys: string[]) => ({ projectFields: keys.map((key) => ({ key })) });

  it('key="units" の KPI の sourceField を使う', () => {
    const config = {
      ...fields('unit_count', 'daisu'),
      kpiDefinitions: [{ key: 'units', sourceField: 'daisu', sortOrder: 0 }],
    };
    expect(resolveUnitsField(config)).toBe('daisu');
  });

  it('units KPI が無ければ既定の unit_count', () => {
    expect(resolveUnitsField(fields('unit_count'))).toBe('unit_count');
  });

  it('案件フィールドに実在しなければ null（台数を出せない事業）', () => {
    expect(resolveUnitsField(fields('amount'))).toBeNull();
    expect(resolveUnitsField(null)).toBeNull();
  });

  it('KPI が指すフィールドが実在しなければ既定にフォールバックせず null', () => {
    // 「設定はあるが実体が無い」を黙って別フィールドで代替すると、
    // 意図しない数字が台数として出る
    const config = {
      ...fields('unit_count'),
      kpiDefinitions: [{ key: 'units', sourceField: 'missing', sortOrder: 0 }],
    };
    expect(resolveUnitsField(config)).toBeNull();
  });
});

describe('getUnitsValue', () => {
  it('数値なら返す（0 も 0 のまま）', () => {
    expect(getUnitsValue({ unit_count: 3 }, 'unit_count')).toBe(3);
    expect(getUnitsValue({ unit_count: 0 }, 'unit_count')).toBe(0);
  });

  it('フィールド未解決・値なし・非数値は null（0 と区別する）', () => {
    expect(getUnitsValue({ unit_count: 3 }, null)).toBeNull();
    expect(getUnitsValue({}, 'unit_count')).toBeNull();
    expect(getUnitsValue({ unit_count: '3' }, 'unit_count')).toBeNull();
    expect(getUnitsValue(null, 'unit_count')).toBeNull();
  });
});
