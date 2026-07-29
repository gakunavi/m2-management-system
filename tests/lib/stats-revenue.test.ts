import { describe, it, expect } from 'vitest';
import { buildRevenueSection, type RevenueSectionInput } from '@/lib/stats-revenue';
import { sumMonthlyPL, type MonthlyPL, type ProjectMonthPL } from '@/lib/profit-helpers';

// ============================================
// テストデータ
// ============================================
//
// 代理店100（1次店）に案件が2件、うち1件はストックで翌月にも計上される。
// 直販（代理店なし）が1件。台数は 10:2台 / 11:3台 / 12:1台。

function project(over: Partial<ProjectMonthPL> = {}): ProjectMonthPL {
  return {
    projectId: 10,
    projectNo: 'MG-0010',
    customerId: 77,
    partnerId: 100,
    partnerName: '株式会社パートナー',
    salesStatus: 'won',
    month: '2026-08',
    isRecognitionMonth: true,
    gmv: 1_000_000,
    companyRevenue: 200_000,
    rewardDirect: 100_000,
    rewardIndirect: 20_000,
    rewardTotal: 120_000,
    grossProfit: 80_000,
    grossMargin: 40,
    grossMarginOnGmv: 8,
    ...over,
  };
}

function month(over: Partial<MonthlyPL> = {}): MonthlyPL {
  return {
    month: '2026-08',
    gmv: 0,
    companyRevenue: 0,
    rewardDirect: 0,
    rewardIndirect: 0,
    rewardTotal: 0,
    grossProfit: 0,
    grossMargin: null,
    grossMarginOnGmv: null,
    projectCount: 0,
    ...over,
  };
}

const UNITS: Record<number, number> = { 10: 2, 11: 3, 12: 1 };

function makeInput(over: Partial<RevenueSectionInput> = {}): RevenueSectionInput {
  const rows: ProjectMonthPL[] = [
    project(),
    // 同じ案件のストック計上（翌月）。計上初月ではない
    project({ month: '2026-09', isRecognitionMonth: false, gmv: 100_000, companyRevenue: 20_000, rewardDirect: 10_000, rewardIndirect: 0, rewardTotal: 10_000, grossProfit: 10_000, grossMargin: 50, grossMarginOnGmv: 10 }),
    project({ projectId: 11, projectNo: 'MG-0011', customerId: 88, gmv: 3_000_000, companyRevenue: 600_000, rewardDirect: 300_000, rewardIndirect: 60_000, rewardTotal: 360_000, grossProfit: 240_000, grossMargin: 40, grossMarginOnGmv: 8 }),
    // 直販（代理店なし → 手数料ゼロ）
    project({ projectId: 12, projectNo: 'MG-0012', customerId: 99, partnerId: null, partnerName: null, gmv: 500_000, companyRevenue: 100_000, rewardDirect: 0, rewardIndirect: 0, rewardTotal: 0, grossProfit: 100_000, grossMargin: 100, grossMarginOnGmv: 20 }),
  ];
  const months: MonthlyPL[] = [
    month({ month: '2026-08', gmv: 4_500_000, companyRevenue: 900_000, rewardDirect: 400_000, rewardIndirect: 80_000, rewardTotal: 480_000, grossProfit: 420_000, grossMargin: 46.7, grossMarginOnGmv: 9.3, projectCount: 3 }),
    month({ month: '2026-09', gmv: 100_000, companyRevenue: 20_000, rewardDirect: 10_000, rewardIndirect: 0, rewardTotal: 10_000, grossProfit: 10_000, grossMargin: 50, grossMarginOnGmv: 10, projectCount: 1 }),
  ];
  return {
    monthsList: ['2026-08', '2026-09', '2026-10'],
    months,
    rows,
    totals: sumMonthlyPL(months),
    unitsOf: (id) => UNITS[id] ?? null,
    unitsResolved: true,
    metaOf: (partnerId) =>
      partnerId == null ? { lineage: '直販', tier: null } : { lineage: 'パートナー系列', tier: '1次代理店' },
    statusLabelOf: (code) => (code === 'won' ? '受注' : code),
    ...over,
  };
}

// ============================================
// by_month
// ============================================

describe('buildRevenueSection: by_month', () => {
  it('月次P/Lの数字をそのまま渡す（再計算しない）', () => {
    const s = buildRevenueSection(makeInput());
    const aug = s.by_month[0];
    expect(aug).toMatchObject({
      month: '2026-08',
      gmv: 4_500_000,
      company_revenue: 900_000,
      reward_direct: 400_000,
      reward_indirect: 80_000,
      reward_total: 480_000,
      gross_profit: 420_000,
      gross_margin: 46.7,
      gross_margin_on_gmv: 9.3,
      project_count: 3,
    });
  });

  it('実績が無い月も 0 で埋めて必ず並べる（月の欠落で読み違えないように）', () => {
    const s = buildRevenueSection(makeInput());
    expect(s.by_month.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(s.by_month[2]).toMatchObject({ gmv: 0, gross_profit: 0, project_count: 0 });
    // 実績が無い月の粗利率は 0% ではなく null（0除算を「粗利ゼロ」に見せない）
    expect(s.by_month[2].gross_margin).toBeNull();
  });

  it('台数は計上初月ぶんだけ。ストック展開した月には乗らない', () => {
    const s = buildRevenueSection(makeInput());
    expect(s.by_month[0].units).toBe(6); // 2 + 3 + 1
    expect(s.by_month[1].units).toBe(0); // ストックのみの月
  });

  it('台数フィールドが解決できない事業では units は一律 null（0 で埋めない）', () => {
    const s = buildRevenueSection(makeInput({ unitsResolved: false }));
    expect(s.by_month.every((m) => m.units === null)).toBe(true);
    expect(s.totals.units).toBeNull();
    expect(s.by_project.every((p) => p.units === null)).toBe(true);
  });
});

// ============================================
// by_project
// ============================================

describe('buildRevenueSection: by_project', () => {
  it('顧客は匿名ID。会社名・顧客名は出さない', () => {
    const s = buildRevenueSection(makeInput());
    expect(s.by_project[0].customer_ref).toMatch(/^cust_\d+$/);
    expect(JSON.stringify(s.by_project)).not.toContain('customer_name');
  });

  it('確度が分かるよう営業ステータスとラベルを返す', () => {
    const s = buildRevenueSection(makeInput());
    expect(s.by_project[0].sales_status).toBe('won');
    expect(s.by_project[0].sales_status_label).toBe('受注');
  });

  it('1案件が複数月にまたがる（by_month の project_count 合計とは一致しない）', () => {
    const s = buildRevenueSection(makeInput());
    const rowCount = s.by_project.length;
    const projectCountSum = s.by_month.reduce((a, m) => a + m.project_count, 0);
    expect(rowCount).toBe(4);
    expect(projectCountSum).toBe(4);
    // ユニーク案件数は3件。行数・project_count 合計と一致しないことを固定する
    expect(new Set(s.by_project.map((p) => p.project_no)).size).toBe(3);
  });

  it('台数は計上初月の行にだけ入る', () => {
    const s = buildRevenueSection(makeInput());
    const stockRow = s.by_project.find((p) => p.month === '2026-09')!;
    expect(stockRow.is_recognition_month).toBe(false);
    expect(stockRow.units).toBeNull();
  });
});

// ============================================
// by_partner
// ============================================

describe('buildRevenueSection: by_partner', () => {
  it('担当代理店ごとに畳み、取扱高の降順で返す', () => {
    const s = buildRevenueSection(makeInput());
    expect(s.by_partner.map((p) => p.partner)).toEqual(['株式会社パートナー', null]);

    const partner = s.by_partner[0];
    expect(partner.gmv).toBe(4_100_000); // 1,000,000 + 100,000(ストック) + 3,000,000
    expect(partner.company_revenue).toBe(820_000);
    expect(partner.reward_total).toBe(490_000);
    expect(partner.gross_profit).toBe(330_000);
    expect(partner.project_count).toBe(2); // 3行だが案件は2件
    expect(partner.lineage).toBe('パートナー系列');
    expect(partner.tier).toBe('1次代理店');
  });

  it('代理店なし（直販）は partner: null の1行にまとまる', () => {
    const s = buildRevenueSection(makeInput());
    const direct = s.by_partner[1];
    expect(direct).toMatchObject({ partner: null, partner_id: null, lineage: '直販', reward_total: 0 });
    // 手数料が発生しないぶん粗利＝自社売上
    expect(direct.gross_profit).toBe(direct.company_revenue);
  });

  it('粗利率は profit-helpers と同じ丸め（小数第1位）', () => {
    const s = buildRevenueSection(makeInput());
    // 330,000 / 820,000 = 40.243...% → 40.2
    expect(s.by_partner[0].gross_margin).toBe(40.2);
    // 330,000 / 4,100,000 = 8.048...% → 8
    expect(s.by_partner[0].gross_margin_on_gmv).toBe(8);
  });
});

// ============================================
// 合計の整合
// ============================================

describe('buildRevenueSection: totals', () => {
  it('by_month・by_partner・totals の金額が一致する', () => {
    const s = buildRevenueSection(makeInput());
    const sum = (get: (x: { gmv: number; company_revenue: number; reward_total: number; gross_profit: number }) => number) => ({
      byMonth: s.by_month.reduce((a, m) => a + get(m), 0),
      byPartner: s.by_partner.reduce((a, p) => a + get(p), 0),
    });

    for (const key of ['gmv', 'company_revenue', 'reward_total', 'gross_profit'] as const) {
      const { byMonth, byPartner } = sum((x) => x[key]);
      expect(byMonth).toBe(s.totals[key]);
      expect(byPartner).toBe(s.totals[key]);
    }
    expect(s.totals.units).toBe(6);
  });

  it('案件が1件も無い期間は 0 の月が並び、合計も 0（totals 自体は null にしない）', () => {
    const s = buildRevenueSection(makeInput({ rows: [], months: [], totals: sumMonthlyPL([]) }));
    expect(s.by_project).toEqual([]);
    expect(s.by_partner).toEqual([]);
    expect(s.totals.gmv).toBe(0);
    expect(s.totals.gross_margin).toBeNull();
  });
});
