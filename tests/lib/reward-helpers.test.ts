import { describe, it, expect } from 'vitest';
import {
  addMonths,
  compareMonth,
  lastDayOfMonth,
  toJstMonthDay,
  applyPaymentTiming,
  getRewardConfig,
  applyRewardSetting,
  calcTax,
  getStockActiveMonths,
  computeProjectEntries,
  type RewardConfig,
  type ProjectRewardInput,
  type LinkRewardInput,
} from '@/lib/reward-helpers';
import type { RewardSlots } from '@/lib/reward-slots';

// ============================================
// 月ヘルパー
// ============================================
describe('addMonths', () => {
  it('月をまたぐ加算', () => {
    expect(addMonths('2026-03', 1)).toBe('2026-04');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
  });
  it('負の加算（前月）', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -5)).toBe('2025-10');
  });
});

describe('compareMonth / lastDayOfMonth', () => {
  it('compareMonth', () => {
    expect(compareMonth('2026-03', '2026-04')).toBe(-1);
    expect(compareMonth('2026-04', '2026-04')).toBe(0);
    expect(compareMonth('2026-05', '2026-04')).toBe(1);
  });
  it('lastDayOfMonth', () => {
    expect(lastDayOfMonth('2026-02')).toBe(28);
    expect(lastDayOfMonth('2024-02')).toBe(29); // 閏年
    expect(lastDayOfMonth('2026-04')).toBe(30);
    expect(lastDayOfMonth('2026-12')).toBe(31);
  });
});

describe('toJstMonthDay', () => {
  it('UTC→JST で月がまたぐ境界', () => {
    // 2026-03-31 22:00 UTC = 2026-04-01 07:00 JST → 4月
    expect(toJstMonthDay(new Date('2026-03-31T22:00:00Z'))).toEqual({ month: '2026-04', day: 1 });
    // 2026-03-31 14:00 UTC = 2026-03-31 23:00 JST → 3月
    expect(toJstMonthDay(new Date('2026-03-31T14:00:00Z'))).toEqual({ month: '2026-03', day: 31 });
  });
});

// ============================================
// 支払いタイミング
// ============================================
describe('applyPaymentTiming', () => {
  it('当月/翌月/翌々月', () => {
    expect(applyPaymentTiming('2026-03', 10, 'same', null)).toBe('2026-03');
    expect(applyPaymentTiming('2026-03', 10, 'next', null)).toBe('2026-04');
    expect(applyPaymentTiming('2026-12', 10, 'next2', null)).toBe('2027-02');
  });
  it('締め日: 締め日以前は当月、超えたら翌月', () => {
    expect(applyPaymentTiming('2026-03', 20, 'closing', 20)).toBe('2026-03'); // 20<=20
    expect(applyPaymentTiming('2026-03', 21, 'closing', 20)).toBe('2026-04'); // 21>20
    expect(applyPaymentTiming('2026-03', 1, 'closing', 20)).toBe('2026-03');
  });
  it('締め日未設定の closing は翌月扱い', () => {
    expect(applyPaymentTiming('2026-03', 15, 'closing', null)).toBe('2026-04');
  });
});

// ============================================
// 報酬設定の適用（率/固定・切り捨て）
// ============================================
describe('applyRewardSetting', () => {
  it('率: ⌊base×率⌋', () => {
    expect(applyRewardSetting({ type: 'rate', value: 20 }, 500000)).toBe(100000);
    expect(applyRewardSetting({ type: 'rate', value: 5 }, 500000)).toBe(25000);
  });
  it('率: 円未満切り捨て', () => {
    // 333333 × 10% = 33333.3 → 33333
    expect(applyRewardSetting({ type: 'rate', value: 10 }, 333333)).toBe(33333);
    // 12345 × 8.5% = 1049.325 → 1049
    expect(applyRewardSetting({ type: 'rate', value: 8.5 }, 12345)).toBe(1049);
  });
  it('固定額: base に依らず value（切り捨て）', () => {
    expect(applyRewardSetting({ type: 'fixed', value: 30000 }, 999999)).toBe(30000);
    expect(applyRewardSetting({ type: 'fixed', value: 3000.9 }, 0)).toBe(3000);
  });
  it('率0 / base0 は 0', () => {
    expect(applyRewardSetting({ type: 'rate', value: 0 }, 500000)).toBe(0);
    expect(applyRewardSetting({ type: 'rate', value: 20 }, 0)).toBe(0);
  });
});

describe('calcTax', () => {
  it('外税10%・切り捨て', () => {
    expect(calcTax(100000, 10)).toBe(10000);
    expect(calcTax(12345, 10)).toBe(1234); // 1234.5 → 1234
  });
});

// ============================================
// getRewardConfig
// ============================================
describe('getRewardConfig', () => {
  it('rewardConfig が無ければ null', () => {
    expect(getRewardConfig({})).toBeNull();
    expect(getRewardConfig(null)).toBeNull();
  });
  it('既定値（taxRate=10, timing=same）と defaults を読む', () => {
    const c = getRewardConfig({
      rewardConfig: {
        defaults: { shot: { direct: { type: 'rate', value: 20 } } },
        shotBaseField: 'proposed_amount',
      },
    });
    expect(c?.taxRate).toBe(10);
    expect(c?.paymentTiming).toBe('same');
    expect(c?.shotBaseField).toBe('proposed_amount');
    expect(c?.defaults.shot?.direct).toEqual({ type: 'rate', value: 20 });
  });
  it('shotBaseField 未指定なら primary KPI の sourceField を使う', () => {
    const c = getRewardConfig({
      kpiDefinitions: [{ key: 'revenue', label: '売上', unit: '円', sourceField: 'amount_x', statusFilter: null, dateField: 'd', isPrimary: true, sortOrder: 0 }],
      rewardConfig: { defaults: {} },
    });
    expect(c?.shotBaseField).toBe('amount_x');
  });
  it('paymentTiming と closingDay を読む', () => {
    const c = getRewardConfig({ rewardConfig: { defaults: {}, paymentTiming: 'closing', closingDay: 20 } });
    expect(c?.paymentTiming).toBe('closing');
    expect(c?.closingDay).toBe(20);
  });
});

// ============================================
// ストック有効月
// ============================================
describe('getStockActiveMonths', () => {
  const base: ProjectRewardInput = {
    id: 1, projectNo: 'P1', customerName: null, partnerId: 1,
    projectExpectedCloseMonth: null, projectCustomData: {},
    revenueConfirmedMonth: '2026-03', revenueConfirmedDay: 10,
    cancelledMonth: null, stockTermMonths: null, rewardOverride: null,
  };
  it('未確定は空', () => {
    expect(getStockActiveMonths({ ...base, revenueConfirmedMonth: null }, '2026-01', '2026-12')).toEqual([]);
  });
  it('継続中は範囲上限まで', () => {
    expect(getStockActiveMonths(base, '2026-01', '2026-06')).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
  });
  it('解約月まで（inclusive）', () => {
    expect(getStockActiveMonths({ ...base, cancelledMonth: '2026-05' }, '2026-01', '2026-12'))
      .toEqual(['2026-03', '2026-04', '2026-05']);
  });
  it('固定期間（3ヶ月）は確定月から3ヶ月', () => {
    expect(getStockActiveMonths({ ...base, stockTermMonths: 3 }, '2026-01', '2026-12'))
      .toEqual(['2026-03', '2026-04', '2026-05']);
  });
  it('固定期間と解約の早い方で終了', () => {
    expect(getStockActiveMonths({ ...base, stockTermMonths: 6, cancelledMonth: '2026-04' }, '2026-01', '2026-12'))
      .toEqual(['2026-03', '2026-04']);
  });
  it('範囲が確定前から始まっても確定月から', () => {
    expect(getStockActiveMonths(base, '2025-01', '2026-04')).toEqual(['2026-03', '2026-04']);
  });
});

// ============================================
// 中核：1案件の報酬明細
// ============================================
const configShotOnly: RewardConfig = {
  defaults: { shot: { direct: { type: 'rate', value: 20 }, indirect: { type: 'rate', value: 5 } } },
  shotBaseField: 'amount', stockBaseField: null, taxRate: 10, paymentTiming: 'same', closingDay: null,
};

const projBase: ProjectRewardInput = {
  id: 10, projectNo: 'MG-0010', customerName: '株式会社A', partnerId: 100,
  projectExpectedCloseMonth: null, projectCustomData: { amount: 500000, monthly: 50000 },
  revenueConfirmedMonth: '2026-03', revenueConfirmedDay: 10,
  cancelledMonth: null, stockTermMonths: null, rewardOverride: null,
};

const responsible: LinkRewardInput = { partnerId: 100, rewardSlots: null, paymentTiming: null, closingDay: null };
const parent: LinkRewardInput = { partnerId: 200, rewardSlots: null, paymentTiming: null, closingDay: null };

describe('computeProjectEntries - ショット', () => {
  it('未確定は空', () => {
    expect(computeProjectEntries({ ...projBase, revenueConfirmedMonth: null }, responsible, parent, configShotOnly, '2026-01', '2026-12')).toEqual([]);
  });

  it('直紹介のみ（親なし）', () => {
    const e = computeProjectEntries(projBase, responsible, null, configShotOnly, '2026-01', '2026-12');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({
      rewardKind: 'shot', entryType: 'direct', partnerId: 100, sourcePartnerId: null,
      baseAmount: 500000, rewardType: 'rate', rate: 20, rewardAmount: 100000,
      sourceMonth: '2026-03', paymentMonth: '2026-03',
    });
  });

  it('2段: 子に直(20%)・親に間接(5%)', () => {
    const e = computeProjectEntries(projBase, responsible, parent, configShotOnly, '2026-01', '2026-12');
    expect(e).toHaveLength(2);
    const direct = e.find((x) => x.entryType === 'direct')!;
    const indirect = e.find((x) => x.entryType === 'indirect')!;
    expect(direct).toMatchObject({ partnerId: 100, rewardAmount: 100000, sourcePartnerId: null });
    expect(indirect).toMatchObject({ partnerId: 200, rewardAmount: 25000, sourcePartnerId: 100 });
  });

  it('確定月がレンジ外なら空', () => {
    expect(computeProjectEntries(projBase, responsible, parent, configShotOnly, '2026-04', '2026-12')).toEqual([]);
  });

  it('案件別上書き（固定額）が最優先', () => {
    const override: RewardSlots = { shot: { direct: { type: 'fixed', value: 30000 } } };
    const e = computeProjectEntries({ ...projBase, rewardOverride: override }, responsible, parent, configShotOnly, '2026-01', '2026-12');
    const direct = e.find((x) => x.entryType === 'direct')!;
    expect(direct).toMatchObject({ rewardType: 'fixed', rate: null, rewardAmount: 30000 });
    // 間接は事業デフォルトのまま
    expect(e.find((x) => x.entryType === 'indirect')!.rewardAmount).toBe(25000);
  });

  it('リンク別率がデフォルトを上書き', () => {
    const link: LinkRewardInput = { partnerId: 100, rewardSlots: { shot: { direct: { type: 'rate', value: 25 } } }, paymentTiming: null, closingDay: null };
    const e = computeProjectEntries(projBase, link, null, configShotOnly, '2026-01', '2026-12');
    expect(e[0].rewardAmount).toBe(125000); // 500000×25%
  });

  it('担当代理店なし（partnerId=null）は直紹介なし', () => {
    const e = computeProjectEntries({ ...projBase, partnerId: null }, null, parent, configShotOnly, '2026-01', '2026-12');
    // 直はなし、間接は親がいるので出る（sourcePartnerId は null）
    expect(e.filter((x) => x.entryType === 'direct')).toHaveLength(0);
    expect(e.find((x) => x.entryType === 'indirect')).toMatchObject({ partnerId: 200, sourcePartnerId: null });
  });
});

describe('computeProjectEntries - ストック', () => {
  const configBoth: RewardConfig = {
    defaults: {
      shot: { direct: { type: 'rate', value: 20 } },
      stock: { direct: { type: 'rate', value: 10 }, indirect: { type: 'fixed', value: 1000 } },
    },
    shotBaseField: 'amount', stockBaseField: 'monthly', taxRate: 10, paymentTiming: 'same', closingDay: null,
  };

  it('確定月から毎月ストック（率）＋確定月にショット', () => {
    const e = computeProjectEntries(projBase, responsible, null, configBoth, '2026-03', '2026-05');
    // ショット直(3月) + ストック直(3,4,5月) = 1 + 3 = 4
    const shot = e.filter((x) => x.rewardKind === 'shot');
    const stock = e.filter((x) => x.rewardKind === 'stock');
    expect(shot).toHaveLength(1);
    expect(stock).toHaveLength(3);
    // ストック直 = 月額50000 × 10% = 5000
    expect(stock.every((x) => x.rewardAmount === 5000 && x.baseAmount === 50000)).toBe(true);
    expect(stock.map((x) => x.sourceMonth)).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('ストック間接（固定1000/月）が親に毎月', () => {
    const e = computeProjectEntries(projBase, responsible, parent, configBoth, '2026-03', '2026-04');
    const stockIndirect = e.filter((x) => x.rewardKind === 'stock' && x.entryType === 'indirect');
    expect(stockIndirect).toHaveLength(2);
    expect(stockIndirect.every((x) => x.partnerId === 200 && x.rewardAmount === 1000)).toBe(true);
  });

  it('解約月まででストック停止', () => {
    const e = computeProjectEntries({ ...projBase, cancelledMonth: '2026-04' }, responsible, null, configBoth, '2026-03', '2026-12');
    const stock = e.filter((x) => x.rewardKind === 'stock');
    expect(stock.map((x) => x.sourceMonth)).toEqual(['2026-03', '2026-04']);
  });

  it('翌月払い: ストック各月が翌月の支払いに乗る', () => {
    const nextCfg: RewardConfig = { ...configBoth, paymentTiming: 'next' };
    const e = computeProjectEntries(projBase, responsible, null, nextCfg, '2026-03', '2026-04');
    const stock = e.filter((x) => x.rewardKind === 'stock');
    expect(stock.find((x) => x.sourceMonth === '2026-03')!.paymentMonth).toBe('2026-04');
    expect(stock.find((x) => x.sourceMonth === '2026-04')!.paymentMonth).toBe('2026-05');
    // ショットも翌月
    expect(e.find((x) => x.rewardKind === 'shot')!.paymentMonth).toBe('2026-04');
  });

  it('ストック設定が無ければストック行は出ない', () => {
    const e = computeProjectEntries(projBase, responsible, null, configShotOnly, '2026-03', '2026-06');
    expect(e.filter((x) => x.rewardKind === 'stock')).toHaveLength(0);
  });
});

describe('computeProjectEntries - 代理店特例の支払いタイミング', () => {
  it('担当代理店の paymentTiming がデフォルトを上書き', () => {
    const cfg: RewardConfig = { ...configShotOnly, paymentTiming: 'same' };
    const link: LinkRewardInput = { partnerId: 100, rewardSlots: null, paymentTiming: 'next', closingDay: null };
    const e = computeProjectEntries(projBase, link, null, cfg, '2026-01', '2026-12');
    expect(e[0].paymentMonth).toBe('2026-04'); // 確定3月→特例で翌月
  });
});
