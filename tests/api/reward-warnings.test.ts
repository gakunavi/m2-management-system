import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// GET /api/v1/rewards/warnings ルートテスト
// ============================================
// 収益確定対象ステータス(isRevenueConfirmed=true)なのに revenueConfirmedAt が
// 未設定の案件を検出するロジックを検証する。

const { mockGetServerSession, mockPrisma } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPrisma: {
    businessStatusDefinition: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { GET } from '@/app/api/v1/rewards/warnings/route';

function getRequest(businessId?: string) {
  const url = new URL('/api/v1/rewards/warnings', 'http://localhost:3000');
  if (businessId) url.searchParams.set('businessId', businessId);
  return new NextRequest(url);
}

describe('GET /api/v1/rewards/warnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 9, role: 'admin' } });
  });

  it('未認証は 401', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(getRequest('1'));
    expect(res.status).toBe(401);
  });

  it('代理店ロールは 403', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 2, role: 'partner_admin' } });
    const res = await GET(getRequest('1'));
    expect(res.status).toBe(403);
  });

  it('businessId 未指定は 400', async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(400);
  });

  it('収益確定対象ステータスが事業に無ければ空配列（クエリを打たない）', async () => {
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);
    const res = await GET(getRequest('1'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
  });

  it('収益確定対象ステータスだが revenueConfirmedAt 未設定の案件を検出する', async () => {
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([
      { statusCode: 'won', statusLabel: '受注' },
      { statusCode: 'paid', statusLabel: '入金済' },
    ]);
    mockPrisma.project.findMany.mockResolvedValue([
      { id: 6, projectNo: 'MG-0006', projectSalesStatus: 'won', customer: { customerName: '株式会社テクノサービス' } },
    ]);

    const res = await GET(getRequest('1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([
      { projectId: 6, projectNo: 'MG-0006', customerName: '株式会社テクノサービス', statusCode: 'won', statusLabel: '受注' },
    ]);

    // クエリが正しいステータスコード集合・条件で絞り込まれていること
    const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({
      businessId: 1,
      projectIsActive: true,
      revenueConfirmedAt: null,
    });
    expect(whereArg.projectSalesStatus.in).toEqual(['won', 'paid']);
  });

  it('顧客未設定の案件は customerName が null', async () => {
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([{ statusCode: 'won', statusLabel: '受注' }]);
    mockPrisma.project.findMany.mockResolvedValue([
      { id: 7, projectNo: 'MG-0007', projectSalesStatus: 'won', customer: null },
    ]);

    const res = await GET(getRequest('1'));
    const json = await res.json();
    expect(json.data[0].customerName).toBeNull();
  });
});
