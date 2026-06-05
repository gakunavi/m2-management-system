import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// モック定義（vi.hoisted でホイスティング対応）
// 認証は STATS_API_TOKEN（env）のみ。next-auth セッションは使わない。
// ============================================

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    business: {
      findFirst: vi.fn(),
    },
    businessStatusDefinition: {
      findMany: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { GET } from '@/app/api/stats/strategy-report/route';

// ============================================
// ヘルパー
// ============================================

const TOKEN = 'unit-test-token';

function createRequest(path: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
}

/** 現在の YYYY-MM（route と同じローカルタイム基準） */
function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** amount/units/close_date を解決できる businessConfig */
function businessConfigWithKpi() {
  return {
    projectFields: [
      { key: 'amount', type: 'number', label: '金額' },
      { key: 'unit_count', type: 'number', label: '台数' },
      { key: 'close_date', type: 'date', label: '成約日' },
    ],
    kpiDefinitions: [
      {
        key: 'revenue',
        label: '売上金額',
        unit: '円',
        aggregation: 'sum',
        sourceField: 'amount',
        dateField: 'close_date',
        isPrimary: true,
        sortOrder: 0,
      },
      {
        key: 'units',
        label: '台数',
        unit: '台',
        aggregation: 'sum',
        sourceField: 'unit_count',
        isPrimary: false,
        sortOrder: 1,
      },
    ],
  };
}

const STATUS_DEFS = [
  { businessId: 1, statusCode: 'lead', statusLabel: '予見', statusIsFinal: false, statusIsLost: false, statusSortOrder: 0, statusIsActive: true },
  { businessId: 1, statusCode: 'quote', statusLabel: '見積提出', statusIsFinal: false, statusIsLost: false, statusSortOrder: 1, statusIsActive: true },
  { businessId: 1, statusCode: 'won', statusLabel: '成約', statusIsFinal: true, statusIsLost: false, statusSortOrder: 2, statusIsActive: true },
  { businessId: 1, statusCode: 'lost', statusLabel: '失注', statusIsFinal: false, statusIsLost: true, statusSortOrder: 3, statusIsActive: true },
];

function sampleProjects(cur: string) {
  const now = new Date();
  const old = new Date(2020, 0, 1);
  return [
    // 予見・直販・active
    { id: 11, customerId: 101, partnerId: null, projectSalesStatus: 'lead', projectExpectedCloseMonth: null, projectCustomData: { amount: 1_000_000 }, createdAt: now, projectStatusChangedAt: null, projectIsActive: true, partner: null },
    // 見積提出・代理店A・active
    { id: 12, customerId: 102, partnerId: 1, projectSalesStatus: 'quote', projectExpectedCloseMonth: null, projectCustomData: { amount: 500_000 }, createdAt: now, projectStatusChangedAt: null, projectIsActive: true, partner: { partnerName: '株式会社A代理店' } },
    // 成約・代理店A・期間内（close_date=当月）・units あり
    { id: 13, customerId: 103, partnerId: 1, projectSalesStatus: 'won', projectExpectedCloseMonth: null, projectCustomData: { amount: 3_000_000, unit_count: 2, close_date: `${cur}-10` }, createdAt: now, projectStatusChangedAt: now, projectIsActive: true, partner: { partnerName: '株式会社A代理店' } },
    // 失注・直販・statusChangedAt=当月
    { id: 14, customerId: 104, partnerId: null, projectSalesStatus: 'lost', projectExpectedCloseMonth: null, projectCustomData: { amount: 0 }, createdAt: now, projectStatusChangedAt: now, projectIsActive: true, partner: null },
    // 成約だが期間外（古い close_date）→ closed_deals から除外。inactive で pipeline からも除外
    { id: 15, customerId: 105, partnerId: null, projectSalesStatus: 'won', projectExpectedCloseMonth: null, projectCustomData: { amount: 9_999_999, unit_count: 1, close_date: '2020-01-10' }, createdAt: old, projectStatusChangedAt: old, projectIsActive: false, partner: null },
  ];
}

// ============================================
// テスト
// ============================================

describe('GET /api/stats/strategy-report', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STATS_API_TOKEN = TOKEN;
    process.env.STATS_BUSINESS_CODE = 'LIGHT';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // --- 認証 ---------------------------------------------------------------

  it('STATS_API_TOKEN 未設定ならトークンを送っても 404（エンドポイント無効化）', async () => {
    delete process.env.STATS_API_TOKEN;
    const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
    expect(res.status).toBe(404);
  });

  it('トークン未指定は 401', async () => {
    const res = await GET(createRequest('/api/stats/strategy-report', null));
    expect(res.status).toBe(401);
  });

  it('不正トークンは 401', async () => {
    const res = await GET(createRequest('/api/stats/strategy-report', 'WRONG'));
    expect(res.status).toBe(401);
  });

  // --- 事業解決 -----------------------------------------------------------

  it('STATS_BUSINESS_CODE 未設定なら 200 + business:null + notes', async () => {
    delete process.env.STATS_BUSINESS_CODE;
    const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.business).toBeNull();
    expect(body.pipeline.by_stage).toEqual([]);
    expect(body.notes).toContain('STATS_BUSINESS_CODE');
    // 事業が解決できないので DB は引かない
    expect(mockPrisma.business.findFirst).not.toHaveBeenCalled();
  });

  it('該当事業が無ければ 200 + business:null + notes に code を含む', async () => {
    mockPrisma.business.findFirst.mockResolvedValue(null);
    const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.business).toBeNull();
    expect(body.notes).toContain('LIGHT');
  });

  // --- 正常系 -------------------------------------------------------------

  describe('正常系（事業=LIGHT, 実データ相当）', () => {
    const cur = currentYm();

    beforeEach(() => {
      mockPrisma.business.findFirst.mockResolvedValue({
        id: 1,
        businessCode: 'LIGHT',
        businessName: 'ライト事業',
        businessConfig: businessConfigWithKpi(),
      });
      mockPrisma.businessStatusDefinition.findMany.mockResolvedValue(STATUS_DEFS);
      mockPrisma.project.findMany.mockResolvedValue(sampleProjects(cur));
    });

    it('business と period を返す', async () => {
      const res = await GET(createRequest('/api/stats/strategy-report?months=6', TOKEN));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.business).toEqual({ code: 'LIGHT', name: 'ライト事業' });
      expect(body.period.from).toMatch(/^\d{4}-\d{2}-01$/);
      expect(body.period.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('pipeline.by_stage はアクティブ案件をステータス順に集計し amount_total を持つ', async () => {
      const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
      const body = await res.json();
      // active: id11(予見), id12(見積提出), id13(成約), id14(失注)。id15 は inactive で除外
      const stages = body.pipeline.by_stage;
      const lead = stages.find((s: { stage: string }) => s.stage === '予見');
      const quote = stages.find((s: { stage: string }) => s.stage === '見積提出');
      expect(lead).toEqual({ stage: '予見', count: 1, amount_total: 1_000_000 });
      expect(quote).toEqual({ stage: '見積提出', count: 1, amount_total: 500_000 });
      // ソート順: 予見 → 見積提出 が成約より前
      const labels = stages.map((s: { stage: string }) => s.stage);
      expect(labels.indexOf('予見')).toBeLessThan(labels.indexOf('成約'));
    });

    it('pipeline.by_agent は直販フォールバックと代理店実名を返す', async () => {
      const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
      const body = await res.json();
      const names = body.pipeline.by_agent.map((a: { agent: string }) => a.agent);
      expect(names).toContain('株式会社A代理店');
      expect(names).toContain('直販');
    });

    it('closed_deals は期間内の成約のみ・顧客は匿名 ID・lead_time_days は null', async () => {
      const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
      const body = await res.json();
      expect(body.closed_deals).toHaveLength(1); // id13 のみ（id15 は期間外）
      const deal = body.closed_deals[0];
      expect(deal.closed_month).toBe(cur);
      expect(deal.agent).toBe('株式会社A代理店');
      expect(deal.units).toBe(2);
      expect(deal.amount).toBe(3_000_000);
      expect(deal.lead_time_days).toBeNull();
      expect(deal.customer_ref).toBe('cust_103');
      // 顧客実名フィールドは存在しない
      expect(Object.keys(deal)).not.toContain('customer_name');
      expect(Object.keys(deal)).not.toContain('customerName');
    });

    it('monthly_summary は当月の new/closed/lost と close_rate を算出する', async () => {
      const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
      const body = await res.json();
      const thisMonth = body.monthly_summary.find((m: { month: string }) => m.month === cur);
      expect(thisMonth).toBeDefined();
      expect(thisMonth.new_deals).toBe(4); // id11-14（id15 は古い createdAt）
      expect(thisMonth.closed).toBe(1); // id13
      expect(thisMonth.lost).toBe(1); // id14
      expect(thisMonth.close_rate).toBe(0.5); // 1 / (1 + 1)
    });

    it('lead_time は全て null、n は closed_deals 件数', async () => {
      const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
      const body = await res.json();
      expect(body.lead_time).toEqual({ avg_days: null, min_days: null, max_days: null, n: 1 });
    });

    it('months=999 は 24 ヶ月にクランプ（monthly_summary=25 バケット）', async () => {
      const res = await GET(createRequest('/api/stats/strategy-report?months=999', TOKEN));
      const body = await res.json();
      expect(body.monthly_summary).toHaveLength(25); // 24 + 当月
    });

    it('months 不正値は既定 6（monthly_summary=7 バケット）', async () => {
      const res = await GET(createRequest('/api/stats/strategy-report?months=abc', TOKEN));
      const body = await res.json();
      expect(body.monthly_summary).toHaveLength(7); // 6 + 当月
    });
  });

  // --- KPI 未定義（金額フィールド解決不可） --------------------------------

  it('KPI 未定義なら amount_total は null・notes に金額の注記', async () => {
    mockPrisma.business.findFirst.mockResolvedValue({
      id: 1,
      businessCode: 'LIGHT',
      businessName: 'ライト事業',
      businessConfig: { projectFields: [], kpiDefinitions: [] },
    });
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue(STATUS_DEFS);
    mockPrisma.project.findMany.mockResolvedValue(sampleProjects(currentYm()));

    const res = await GET(createRequest('/api/stats/strategy-report', TOKEN));
    const body = await res.json();
    expect(res.status).toBe(200);
    for (const s of body.pipeline.by_stage) {
      expect(s.amount_total).toBeNull();
    }
    expect(body.notes).toContain('金額');
  });
});
