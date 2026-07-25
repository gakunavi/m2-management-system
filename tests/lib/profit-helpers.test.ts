import { describe, it, expect } from 'vitest';
import {
  computeProjectFinancials,
  computeMonthlyPL,
  sumMonthlyPL,
  resolveProfitBasis,
  resolveProjectCompanyShare,
  type ProfitBasis,
} from '@/lib/profit-helpers';
import {
  getRewardConfig,
  type BusinessRewardContext,
  type LinkRewardInput,
  type ProjectRewardInput,
  type RewardConfig,
} from '@/lib/reward-helpers';
import {
  mergeCompanyShare,
  isCompanyShareConfigured,
  parseCompanyShare,
} from '@/lib/company-share';

// ============================================
// 自社取り分の解決
// ============================================

describe('mergeCompanyShare', () => {
  it('後の層がスロット単位で上書きする', () => {
    const merged = mergeCompanyShare(
      { shot: { type: 'rate', value: 20 }, stock: { type: 'rate', value: 20 } },
      { shot: { type: 'rate', value: 15 } },
    );
    expect(merged.shot).toEqual({ type: 'rate', value: 15 });
    expect(merged.stock).toEqual({ type: 'rate', value: 20 });
  });

  it('空の上書きは事業デフォルトをそのまま残す', () => {
    const merged = mergeCompanyShare({ shot: { type: 'rate', value: 20 } }, {});
    expect(merged.shot).toEqual({ type: 'rate', value: 20 });
  });
});

describe('isCompanyShareConfigured', () => {
  it('片方でも設定されていれば true', () => {
    expect(isCompanyShareConfigured({ stock: { type: 'fixed', value: 1000 } })).toBe(true);
  });
  it('空・null は false', () => {
    expect(isCompanyShareConfigured({})).toBe(false);
    expect(isCompanyShareConfigured(null)).toBe(false);
  });
});

describe('parseCompanyShare', () => {
  it('不正な JSON は空にフォールバック', () => {
    expect(parseCompanyShare({ shot: { type: 'percent', value: 20 } })).toEqual({});
    expect(parseCompanyShare('20%')).toEqual({});
    expect(parseCompanyShare(null)).toEqual({});
  });
});

describe('getRewardConfig - companyShare', () => {
  it('businessConfig から自社取り分を読む', () => {
    const c = getRewardConfig({
      rewardConfig: {
        defaults: {},
        shotBaseField: 'amount',
        companyShare: { shot: { type: 'rate', value: 20 }, shotBaseField: 'gross' },
      },
    });
    expect(c?.companyShare.shot).toEqual({ type: 'rate', value: 20 });
    expect(c?.companyShare.shotBaseField).toBe('gross');
  });

  it('companyShare 未設定なら空オブジェクト', () => {
    const c = getRewardConfig({ rewardConfig: { defaults: {} } });
    expect(c?.companyShare).toEqual({});
  });
});

// ============================================
// 計上基準（ダッシュボードの売上KPIと同じ参照先）
// ============================================

const businessConfig = {
  kpiDefinitions: [
    {
      key: 'revenue',
      label: '【合計】受注見込み金額',
      unit: '円',
      aggregation: 'sum',
      sourceField: 'amount',
      statusFilter: ['受注', '納品済'],
      dateField: 'projectExpectedCloseMonth',
      isPrimary: true,
      sortOrder: 0,
    },
    {
      key: 'units',
      label: '導入台数',
      unit: '台',
      aggregation: 'sum',
      sourceField: 'units',
      statusFilter: null,
      dateField: 'projectExpectedCloseMonth',
      isPrimary: false,
      sortOrder: 1,
    },
  ],
};

describe('resolveProfitBasis', () => {
  it('プライマリKPIの参照先・集計軸をそのまま使う', () => {
    const basis = resolveProfitBasis(businessConfig);
    expect(basis).toEqual({
      sourceField: 'amount',
      dateField: 'projectExpectedCloseMonth',
      statusCodes: ['受注', '納品済'],
      label: '【合計】受注見込み金額',
    });
  });

  it('statusFilter が単一文字列でも配列に正規化する', () => {
    const basis = resolveProfitBasis({
      kpiDefinitions: [{ ...businessConfig.kpiDefinitions[0], statusFilter: '受注' }],
    });
    expect(basis?.statusCodes).toEqual(['受注']);
  });

  it('数量KPI（count集計）は取扱高の基準にしない', () => {
    const basis = resolveProfitBasis({
      kpiDefinitions: [{ ...businessConfig.kpiDefinitions[0], aggregation: 'count', sourceField: null }],
    });
    expect(basis?.sourceField).toBeNull();
  });

  it('KPI定義が無ければ null', () => {
    expect(resolveProfitBasis({})).toBeNull();
  });
});

const basis: ProfitBasis = {
  sourceField: 'amount',
  dateField: 'projectExpectedCloseMonth',
  statusCodes: ['受注', '納品済'],
  label: '【合計】受注見込み金額',
};

// ============================================
// 案件1件の収益
// ============================================

const config: RewardConfig = {
  defaults: {
    shot: { direct: { type: 'rate', value: 10 }, indirect: { type: 'rate', value: 2 } },
    stock: { direct: { type: 'rate', value: 5 } },
  },
  shotBaseField: 'amount',
  stockBaseField: 'monthly',
  taxRate: 10,
  paymentTiming: 'same',
  closingDay: null,
  companyShare: { shot: { type: 'rate', value: 20 }, stock: { type: 'rate', value: 20 } },
};

// 収益確定日は入っていない。ダッシュボードの収益はKPIの計上月で計算するため、
// 収益確定日が無くても数字が出ることがこのテストの主眼。
const project: ProjectRewardInput = {
  id: 10,
  projectNo: 'MG-0010',
  customerName: '株式会社A',
  partnerId: 100,
  projectExpectedCloseMonth: '2026-03',
  projectCustomData: { amount: 500_000, monthly: 50_000 },
  revenueConfirmedMonth: null,
  revenueConfirmedDay: null,
  cancelledMonth: null,
  stockTermMonths: null,
  rewardOverride: null,
  companyShareOverride: null,
};

const responsible: LinkRewardInput = { partnerId: 100, rewardSlots: null, paymentTiming: null, closingDay: null };
const parent: LinkRewardInput = { partnerId: 200, rewardSlots: null, paymentTiming: null, closingDay: null };

describe('resolveProjectCompanyShare', () => {
  it('案件別上書きが事業デフォルトに勝つ', () => {
    const { share, isOverridden } = resolveProjectCompanyShare(config, {
      ...project,
      companyShareOverride: { shot: { type: 'rate', value: 15 } },
    });
    expect(share.shot).toEqual({ type: 'rate', value: 15 });
    // 上書きしていないストックは事業デフォルトのまま
    expect(share.stock).toEqual({ type: 'rate', value: 20 });
    expect(isOverridden).toBe(true);
  });

  it('上書きが無ければ事業デフォルト', () => {
    const { share, isOverridden } = resolveProjectCompanyShare(config, project);
    expect(share.shot).toEqual({ type: 'rate', value: 20 });
    expect(isOverridden).toBe(false);
  });
});

describe('computeProjectFinancials', () => {
  it('収益確定日が無くてもKPIの計上月があれば計算される', () => {
    const f = computeProjectFinancials(project, responsible, parent, config, basis, true);
    // 取扱高 500,000 × 20% = 100,000
    expect(f.companyRevenueShot).toBe(100_000);
    // 報酬 直10% = 50,000 / 間接2% = 10,000
    expect(f.rewardShotDirect).toBe(50_000);
    expect(f.rewardShotIndirect).toBe(10_000);
    // 粗利 100,000 - 60,000 = 40,000（40.0%）
    expect(f.grossProfitShot).toBe(40_000);
    expect(f.grossMarginShot).toBe(40);
    expect(f.companyShareShotLabel).toBe('20%');
  });

  it('ストック: 月額ベースで計算する', () => {
    const f = computeProjectFinancials(project, responsible, parent, config, basis, true);
    expect(f.companyRevenueStock).toBe(10_000); // 50,000 × 20%
    expect(f.rewardStockDirect).toBe(2_500); // 50,000 × 5%
    expect(f.rewardStockIndirect).toBeNull(); // 間接ストックは未設定
    expect(f.grossProfitStock).toBe(7_500);
    expect(f.grossMarginStock).toBe(75);
  });

  it('案件別上書きが金額に反映される', () => {
    const f = computeProjectFinancials(
      { ...project, companyShareOverride: { shot: { type: 'rate', value: 15 } } },
      responsible,
      parent,
      config,
      basis,
      true,
    );
    expect(f.companyRevenueShot).toBe(75_000);
    expect(f.grossProfitShot).toBe(15_000); // 75,000 - 60,000
    expect(f.companyShareShotLabel).toBe('15%');
    expect(f.companyShareIsOverridden).toBe(true);
  });

  it('固定額の取り分にも対応する', () => {
    const f = computeProjectFinancials(
      { ...project, companyShareOverride: { shot: { type: 'fixed', value: 80_000 } } },
      responsible,
      parent,
      config,
      basis,
      true,
    );
    expect(f.companyRevenueShot).toBe(80_000);
    expect(f.companyShareShotLabel).toBe('¥80,000');
  });

  it('計上対象外のステータスは金額が全て null。取り分ラベルだけ返す', () => {
    const f = computeProjectFinancials(project, responsible, parent, config, basis, false);
    expect(f.companyRevenueShot).toBeNull();
    expect(f.rewardShotDirect).toBeNull();
    expect(f.grossProfitShot).toBeNull();
    expect(f.grossMarginShot).toBeNull();
    expect(f.companyShareShotLabel).toBe('20%');
  });

  it('計上月が決まらない案件は金額を出さない', () => {
    const f = computeProjectFinancials(
      { ...project, projectExpectedCloseMonth: null },
      responsible,
      parent,
      config,
      basis,
      true,
    );
    expect(f.companyRevenueShot).toBeNull();
    expect(f.rewardShotDirect).toBeNull();
  });

  it('取り分未設定なら自社売上・粗利は null（0 ではない）', () => {
    const f = computeProjectFinancials(project, responsible, parent, { ...config, companyShare: {} }, basis, true);
    expect(f.companyRevenueShot).toBeNull();
    expect(f.grossProfitShot).toBeNull();
    expect(f.companyShareShotLabel).toBeNull();
    // 報酬は取り分と無関係に計算される
    expect(f.rewardShotDirect).toBe(50_000);
  });

  it('親代理店が無ければ間接報酬は null', () => {
    const f = computeProjectFinancials(project, responsible, null, config, basis, true);
    expect(f.rewardShotIndirect).toBeNull();
    expect(f.grossProfitShot).toBe(50_000); // 100,000 - 50,000
  });

  it('取り分の基準フィールドを個別指定できる', () => {
    const f = computeProjectFinancials(
      { ...project, projectCustomData: { amount: 10, monthly: 50_000, gross: 500_000 } },
      responsible,
      parent,
      {
        ...config,
        // 報酬の基準は台数(amount)だが、取り分の基準は金額(gross)
        companyShare: { ...config.companyShare, shotBaseField: 'gross' },
      },
      basis,
      true,
    );
    expect(f.companyRevenueShot).toBe(100_000); // 500,000 × 20%
    expect(f.rewardShotDirect).toBe(1); // 10 × 10%（報酬は従来どおり amount 基準）
  });

  it('自社売上が 0 なら粗利率は null（0除算を返さない）', () => {
    const f = computeProjectFinancials(
      { ...project, projectCustomData: { amount: 0, monthly: 0 } },
      responsible,
      parent,
      config,
      basis,
      true,
    );
    expect(f.companyRevenueShot).toBe(0);
    expect(f.grossProfitShot).toBe(0);
    expect(f.grossMarginShot).toBeNull();
  });
});

// ============================================
// 月次 P/L
// ============================================

function makeContext(
  overrides: Partial<{ cancelledAt: Date | null; projectSalesStatus: string }> = {},
): BusinessRewardContext {
  return {
    config,
    businessConfig,
    linkByPartner: new Map([
      [100, { partnerId: 100, rewardSlots: null, paymentTiming: null, closingDay: null, businessParentId: 200 }],
      [200, { partnerId: 200, rewardSlots: null, paymentTiming: null, closingDay: null, businessParentId: null }],
    ]),
    projects: [
      {
        id: 10,
        projectNo: 'MG-0010',
        partnerId: 100,
        projectSalesStatus: overrides.projectSalesStatus ?? '受注',
        projectExpectedCloseMonth: '2026-03',
        projectCustomData: { amount: 500_000, monthly: 50_000 },
        // 収益確定日は入っていない（ダッシュボードは見込みベース）
        revenueConfirmedAt: null,
        cancelledAt: overrides.cancelledAt ?? null,
        stockTermMonths: null,
        rewardOverride: null,
        companyShareOverride: null,
        customer: { customerName: '株式会社A' },
      },
    ],
  };
}

describe('computeMonthlyPL', () => {
  it('収益確定日が無くてもKPIの計上月で集計される', () => {
    const months = computeMonthlyPL(makeContext(), basis, '2026-03', '2026-05');
    expect(months.map((m) => m.month)).toEqual(['2026-03', '2026-04', '2026-05']);

    // 計上月: ショット(500,000) + ストック(50,000)
    const march = months[0];
    expect(march.gmv).toBe(550_000);
    expect(march.companyRevenue).toBe(110_000); // 100,000 + 10,000
    expect(march.rewardDirect).toBe(52_500); // ショット50,000 + ストック2,500
    expect(march.rewardIndirect).toBe(10_000); // ショット間接のみ
    expect(march.grossProfit).toBe(47_500); // 110,000 - 62,500
  });

  it('ストックは売上・報酬とも毎月立つ（2ヶ月目以降に粗利がマイナスにならない）', () => {
    const months = computeMonthlyPL(makeContext(), basis, '2026-03', '2026-05');
    for (const m of months.slice(1)) {
      expect(m.gmv).toBe(50_000);
      expect(m.companyRevenue).toBe(10_000);
      expect(m.rewardTotal).toBe(2_500);
      expect(m.grossProfit).toBe(7_500);
      expect(m.grossMargin).toBe(75);
    }
  });

  it('KPIのステータス条件に合致しない案件は集計しない', () => {
    const months = computeMonthlyPL(makeContext({ projectSalesStatus: '商談中' }), basis, '2026-03', '2026-05');
    expect(months).toEqual([]);
  });

  it('解約月まででストックが止まる', () => {
    const months = computeMonthlyPL(
      makeContext({ cancelledAt: new Date('2026-04-20T00:00:00Z') }),
      basis,
      '2026-03',
      '2026-06',
    );
    expect(months.map((m) => m.month)).toEqual(['2026-03', '2026-04']);
  });

  it('期間外の月は含まない', () => {
    const months = computeMonthlyPL(makeContext(), basis, '2026-05', '2026-06');
    expect(months.map((m) => m.month)).toEqual(['2026-05', '2026-06']);
    // ショットは 2026-03 なので範囲外。ストックのみ
    expect(months[0].gmv).toBe(50_000);
  });

  it('計上基準が無ければ空（KPI未定義の事業）', () => {
    expect(computeMonthlyPL(makeContext(), null, '2026-03', '2026-05')).toEqual([]);
  });

  it('取り分未設定の事業では自社売上 0・粗利はマイナス（呼び出し側で非表示にする前提）', () => {
    const ctx = makeContext();
    const months = computeMonthlyPL(
      { ...ctx, config: { ...config, companyShare: {} } },
      basis,
      '2026-03',
      '2026-03',
    );
    expect(months[0].companyRevenue).toBe(0);
    expect(months[0].grossProfit).toBe(-62_500);
    expect(months[0].grossMargin).toBeNull();
  });

  it('案件数は月ごとの実数（重複カウントしない）', () => {
    const months = computeMonthlyPL(makeContext(), basis, '2026-03', '2026-04');
    expect(months[0].projectCount).toBe(1);
    expect(months[1].projectCount).toBe(1);
  });
});

describe('sumMonthlyPL', () => {
  it('期間合計と粗利率を集計する', () => {
    const total = sumMonthlyPL(computeMonthlyPL(makeContext(), basis, '2026-03', '2026-05'));
    expect(total.gmv).toBe(650_000); // 550,000 + 50,000 + 50,000
    expect(total.companyRevenue).toBe(130_000);
    expect(total.rewardTotal).toBe(67_500); // 62,500 + 2,500 + 2,500
    expect(total.grossProfit).toBe(62_500);
    expect(total.grossMargin).toBeCloseTo(48.1, 1);
  });

  it('空配列は 0 埋め・粗利率 null', () => {
    const total = sumMonthlyPL([]);
    expect(total.grossProfit).toBe(0);
    expect(total.grossMargin).toBeNull();
  });
});
