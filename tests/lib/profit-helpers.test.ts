import { describe, it, expect } from 'vitest';
import {
  computeProjectFinancials,
  computeMonthlyPL,
  computeProjectPLRows,
  computeProjectMonthPLRows,
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
  type RewardChainNode,
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

  it('収益の計上対象ステータスが設定されていればKPIより優先する', () => {
    const basis = resolveProfitBasis({
      ...businessConfig,
      rewardConfig: {
        defaults: {},
        companyShare: { shot: { type: 'rate', value: 20 }, statusFilter: ['受注'] },
      },
    });
    // 取扱高・計上月はプライマリKPIのまま、母集団だけ絞られる
    expect(basis?.statusCodes).toEqual(['受注']);
    expect(basis?.sourceField).toBe('amount');
    expect(basis?.dateField).toBe('projectExpectedCloseMonth');
  });

  it('収益の計上対象ステータスが未設定・空配列ならKPIの statusFilter に従う', () => {
    const withNull = resolveProfitBasis({
      ...businessConfig,
      rewardConfig: { defaults: {}, companyShare: { statusFilter: null } },
    });
    expect(withNull?.statusCodes).toEqual(['受注', '納品済']);

    const withEmpty = resolveProfitBasis({
      ...businessConfig,
      rewardConfig: { defaults: {}, companyShare: { statusFilter: [] } },
    });
    expect(withEmpty?.statusCodes).toEqual(['受注', '納品済']);
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
// 上位店は自身のリンク設定で料率を持つ（事業デフォルトは担当店にしか効かない）
const PARENT_SLOTS = { shot: { indirect: { type: 'rate' as const, value: 2 } } };
const parent: LinkRewardInput = {
  partnerId: 200,
  rewardSlots: PARENT_SLOTS,
  paymentTiming: null,
  closingDay: null,
};

/** 担当店のみ（上位店なし） */
const chainSolo: RewardChainNode[] = [{ partnerId: 100, link: responsible, isAssigned: true }];
/** 担当店 → 上位店1段 */
const chainWithParent: RewardChainNode[] = [
  ...chainSolo,
  { partnerId: 200, link: parent, isAssigned: false },
];

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
    const f = computeProjectFinancials(project, chainWithParent, config, basis, true);
    // 取扱高 500,000 × 20% = 100,000
    expect(f.companyRevenueShot).toBe(100_000);
    // 報酬 直10% = 50,000 / 間接2% = 10,000
    expect(f.rewardShotDirect).toBe(50_000);
    expect(f.rewardShotIndirect).toBe(10_000);
    expect(f.rewardShotTotal).toBe(60_000); // 支払額の合計
    // 粗利 100,000 - 60,000 = 40,000（40.0%）
    expect(f.grossProfitShot).toBe(40_000);
    expect(f.grossMarginShot).toBe(40);
    expect(f.companyShareShotLabel).toBe('20%');
  });

  it('ストック: 月額ベースで計算する', () => {
    const f = computeProjectFinancials(project, chainWithParent, config, basis, true);
    expect(f.companyRevenueStock).toBe(10_000); // 50,000 × 20%
    expect(f.rewardStockDirect).toBe(2_500); // 50,000 × 5%
    expect(f.rewardStockIndirect).toBeNull(); // 上位代理店ぶんは未設定
    expect(f.rewardStockTotal).toBe(2_500); // 片方だけでも合計は出す
    expect(f.grossProfitStock).toBe(7_500);
    expect(f.grossMarginStock).toBe(75);
  });

  it('案件別上書きが金額に反映される', () => {
    const f = computeProjectFinancials(
      { ...project, companyShareOverride: { shot: { type: 'rate', value: 15 } } },
      chainWithParent,
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
      chainWithParent,
      config,
      basis,
      true,
    );
    expect(f.companyRevenueShot).toBe(80_000);
    expect(f.companyShareShotLabel).toBe('¥80,000');
  });

  it('計上対象外のステータスは金額が全て null。取り分ラベルだけ返す', () => {
    const f = computeProjectFinancials(project, chainWithParent, config, basis, false);
    expect(f.companyRevenueShot).toBeNull();
    expect(f.rewardShotDirect).toBeNull();
    expect(f.grossProfitShot).toBeNull();
    expect(f.grossMarginShot).toBeNull();
    expect(f.companyShareShotLabel).toBe('20%');
  });

  it('計上月が決まらない案件は金額を出さない', () => {
    const f = computeProjectFinancials(
      { ...project, projectExpectedCloseMonth: null },
      chainWithParent,
      config,
      basis,
      true,
    );
    expect(f.companyRevenueShot).toBeNull();
    expect(f.rewardShotDirect).toBeNull();
  });

  it('取り分未設定なら自社売上・粗利は null（0 ではない）', () => {
    const f = computeProjectFinancials(project, chainWithParent, { ...config, companyShare: {} }, basis, true);
    expect(f.companyRevenueShot).toBeNull();
    expect(f.grossProfitShot).toBeNull();
    expect(f.companyShareShotLabel).toBeNull();
    // 支払手数料は取り分と無関係に計算される
    expect(f.rewardShotDirect).toBe(50_000);
  });

  it('親代理店が無ければ間接報酬は null', () => {
    const f = computeProjectFinancials(project, chainSolo, config, basis, true);
    expect(f.rewardShotIndirect).toBeNull();
    expect(f.grossProfitShot).toBe(50_000); // 100,000 - 50,000
  });

  it('取り分の基準フィールドを個別指定できる', () => {
    const f = computeProjectFinancials(
      { ...project, projectCustomData: { amount: 10, monthly: 50_000, gross: 500_000 } },
      chainWithParent,
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

  it('プライマリKPIが数量でも、取り分は報酬と同じ金額フィールドを基準にする', () => {
    // プライマリKPIが「受注見込み数」のような数量フィールドのケース。
    // 取り分がKPI基準になると 3 × 20% = 0.6 → 切り捨てで 0 円になってしまう
    const countBasis: ProfitBasis = { ...basis, sourceField: 'units', label: '【合計】受注見込み数' };
    const f = computeProjectFinancials(
      { ...project, projectCustomData: { amount: 7_200_000, units: 3 } },
      chainWithParent,
      config, // shotBaseField: 'amount'（金額）
      countBasis,
      true,
    );
    expect(f.companyRevenueShot).toBe(1_440_000); // 7,200,000 × 20%
    expect(f.rewardShotDirect).toBe(720_000); // 7,200,000 × 10%
    expect(f.grossProfitShot).toBe(576_000); // 1,440,000 − 720,000 − 144,000
  });

  it('自社売上が 0 なら粗利率は null（0除算を返さない）', () => {
    const f = computeProjectFinancials(
      { ...project, projectCustomData: { amount: 0, monthly: 0 } },
      chainWithParent,
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
      [200, { partnerId: 200, rewardSlots: PARENT_SLOTS, paymentTiming: null, closingDay: null, businessParentId: null }],
    ]),
    projects: [
      {
        id: 10,
        projectNo: 'MG-0010',
        customerId: 77,
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
        partner: { partnerName: '株式会社パートナー' },
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
    // 自社売上比: 47,500 / 110,000 ≈ 43.2% / 取扱高比: 47,500 / 550,000 ≈ 8.6%
    expect(march.grossMargin).toBeCloseTo(43.2, 1);
    expect(march.grossMarginOnGmv).toBeCloseTo(8.6, 1);
  });

  it('ストックは売上・報酬とも毎月立つ（2ヶ月目以降に粗利がマイナスにならない）', () => {
    const months = computeMonthlyPL(makeContext(), basis, '2026-03', '2026-05');
    for (const m of months.slice(1)) {
      expect(m.gmv).toBe(50_000);
      expect(m.companyRevenue).toBe(10_000);
      expect(m.rewardTotal).toBe(2_500);
      expect(m.grossProfit).toBe(7_500);
      expect(m.grossMargin).toBe(75);
      // 取扱高比は自社売上比より必ず小さい（取扱高 > 自社売上のため）
      expect(m.grossMarginOnGmv).toBe(15); // 7,500 / 50,000
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
    // 取扱高比は自社取り分が無くても計算できる（取扱高は 0 ではないため）
    expect(months[0].grossMarginOnGmv).toBeCloseTo(-11.4, 1);
  });

  it('プライマリKPIが数量でも、取扱高・自社売上は金額フィールドで集計する', () => {
    const ctx = makeContext();
    ctx.projects[0].projectCustomData = { amount: 7_200_000, units: 3, monthly: 0 };
    const countBasis: ProfitBasis = { ...basis, sourceField: 'units' };
    const months = computeMonthlyPL(ctx, countBasis, '2026-03', '2026-03');
    expect(months[0].gmv).toBe(7_200_000); // 台数(3)ではなく金額
    expect(months[0].companyRevenue).toBe(1_440_000);
    expect(months[0].grossProfit).toBe(576_000);
  });

  it('案件数は月ごとの実数（重複カウントしない）', () => {
    const months = computeMonthlyPL(makeContext(), basis, '2026-03', '2026-04');
    expect(months[0].projectCount).toBe(1);
    expect(months[1].projectCount).toBe(1);
  });
});

describe('computeProjectPLRows', () => {
  it('案件別の内訳が月次合計と一致する', () => {
    const ctx = makeContext();
    const rows = computeProjectPLRows(ctx, basis, '2026-03', '2026-05');
    const months = computeMonthlyPL(ctx, basis, '2026-03', '2026-05');
    const total = sumMonthlyPL(months);

    expect(rows).toHaveLength(1);
    expect(rows[0].projectNo).toBe('MG-0010');
    expect(rows[0].partnerName).toBe('株式会社パートナー');
    expect(rows[0].gmv).toBe(total.gmv);
    expect(rows[0].companyRevenue).toBe(total.companyRevenue);
    expect(rows[0].rewardTotal).toBe(total.rewardTotal);
    expect(rows[0].grossProfit).toBe(total.grossProfit);
    expect(rows[0].grossMarginOnGmv).toBe(total.grossMarginOnGmv);
  });

  it('代理店が紐づいていない案件は手数料0で partnerName が null', () => {
    const ctx = makeContext();
    ctx.projects[0].partnerId = null;
    ctx.projects[0].partner = null;
    const rows = computeProjectPLRows(ctx, basis, '2026-03', '2026-03');
    expect(rows[0].partnerName).toBeNull();
    expect(rows[0].rewardTotal).toBe(0);
    // 手数料が発生しないぶん、粗利は自社売上そのもの
    expect(rows[0].grossProfit).toBe(rows[0].companyRevenue);
  });

  it('計上対象外の案件は含まれない', () => {
    const rows = computeProjectPLRows(makeContext({ projectSalesStatus: '商談中' }), basis, '2026-03', '2026-05');
    expect(rows).toEqual([]);
  });
});

describe('computeProjectMonthPLRows', () => {
  it('案件×月に展開され、合計は月次P/Lと一致する', () => {
    const ctx = makeContext();
    const rows = computeProjectMonthPLRows(ctx, basis, '2026-03', '2026-05');
    const months = computeMonthlyPL(ctx, basis, '2026-03', '2026-05');

    // 1案件がショット(3月)＋ストック(3〜5月)で3ヶ月ぶんの行になる
    expect(rows.map((r) => r.month).sort()).toEqual(['2026-03', '2026-04', '2026-05']);

    for (const m of months) {
      const row = rows.find((r) => r.month === m.month)!;
      expect(row.gmv).toBe(m.gmv);
      expect(row.companyRevenue).toBe(m.companyRevenue);
      expect(row.rewardDirect).toBe(m.rewardDirect);
      expect(row.rewardIndirect).toBe(m.rewardIndirect);
      expect(row.rewardTotal).toBe(m.rewardTotal);
      expect(row.grossProfit).toBe(m.grossProfit);
      expect(row.grossMargin).toBe(m.grossMargin);
      expect(row.grossMarginOnGmv).toBe(m.grossMarginOnGmv);
    }
  });

  it('計上初月だけ is_recognition_month が true（台数の重複計上を防ぐ目印）', () => {
    const rows = computeProjectMonthPLRows(makeContext(), basis, '2026-03', '2026-05');
    expect(rows.filter((r) => r.isRecognitionMonth).map((r) => r.month)).toEqual(['2026-03']);
  });

  it('外部集計API向けに顧客ID・営業ステータス・代理店IDを持つ（顧客名は使わせない）', () => {
    const rows = computeProjectMonthPLRows(makeContext(), basis, '2026-03', '2026-03');
    expect(rows[0].customerId).toBe(77);
    expect(rows[0].partnerId).toBe(100);
    expect(rows[0].salesStatus).toBe('受注');
    expect(rows[0].projectNo).toBe('MG-0010');
    expect(rows[0]).not.toHaveProperty('customerName');
  });

  it('取扱高の大きい順に並ぶ', () => {
    const ctx = makeContext();
    const rows = computeProjectMonthPLRows(ctx, basis, '2026-03', '2026-05');
    const gmvs = rows.map((r) => r.gmv);
    expect(gmvs).toEqual([...gmvs].sort((a, b) => b - a));
  });

  it('計上対象外の案件は含まれない', () => {
    const rows = computeProjectMonthPLRows(
      makeContext({ projectSalesStatus: '商談中' }),
      basis,
      '2026-03',
      '2026-05',
    );
    expect(rows).toEqual([]);
  });

  it('計上基準が無ければ空（KPI未定義の事業）', () => {
    expect(computeProjectMonthPLRows(makeContext(), null, '2026-03', '2026-05')).toEqual([]);
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
    // 取扱高比: 62,500 / 650,000 ≈ 9.6%（自社売上比よりかなり小さい）
    expect(total.grossMarginOnGmv).toBeCloseTo(9.6, 1);
  });

  it('空配列は 0 埋め・粗利率 null', () => {
    const total = sumMonthlyPL([]);
    expect(total.grossProfit).toBe(0);
    expect(total.grossMargin).toBeNull();
    expect(total.grossMarginOnGmv).toBeNull();
  });
});
