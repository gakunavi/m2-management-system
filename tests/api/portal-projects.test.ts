import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// vi.hoisted でモック変数を先に定義（ホイスティング対応）
// ============================================

const { mockGetServerSession, mockPrisma, mockGetBusinessPartnerScope } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPrisma: {
    project: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    businessStatusDefinition: {
      findMany: vi.fn(),
    },
  },
  mockGetBusinessPartnerScope: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/revenue-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/revenue-helpers')>('@/lib/revenue-helpers');
  return {
    ...actual,
    getBusinessPartnerScope: mockGetBusinessPartnerScope,
  };
});

import { GET } from '@/app/api/v1/portal/projects/route';

// ============================================
// ヘルパー
// ============================================

function createRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

// ============================================
// ポータル案件一覧テスト
// ============================================

describe('GET /api/v1/portal/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================
  // 認証・認可テスト
  // ========================================

  it('未認証の場合は 401 を返す', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET(createRequest('/api/v1/portal/projects'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('admin ロールは 403 を返す', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin', partnerId: null },
    });

    const response = await GET(createRequest('/api/v1/portal/projects'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('staff ロールは 403 を返す', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 2, role: 'staff', partnerId: null },
    });

    const response = await GET(createRequest('/api/v1/portal/projects'));

    expect(response.status).toBe(403);
  });

  it('partnerId が未設定の partner_admin は 403', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 5, role: 'partner_admin', partnerId: null },
    });

    const response = await GET(createRequest('/api/v1/portal/projects'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.message).toContain('代理店情報');
  });

  // ========================================
  // スコープテスト
  // ========================================

  it('partner_admin: 自社+下位代理店の案件を取得', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 10, role: 'partner_admin', partnerId: 100 },
    });

    mockGetBusinessPartnerScope.mockResolvedValue([100, 101, 102]);

    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    await GET(createRequest('/api/v1/portal/projects'));

    const countCall = mockPrisma.project.count.mock.calls[0][0];
    expect(countCall.where.partnerId).toEqual({ in: [100, 101, 102] });
  });

  it('partner_staff: 自分担当分のみ', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 20, role: 'partner_staff', partnerId: 100 },
    });

    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    await GET(createRequest('/api/v1/portal/projects'));

    const countCall = mockPrisma.project.count.mock.calls[0][0];
    expect(countCall.where.projectAssignedUserId).toBe(20);
    expect(countCall.where.partnerId).toBeUndefined();
  });

  // ========================================
  // レスポンス構造テスト
  // ========================================

  it('正常レスポンスの構造が正しい', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 10, role: 'partner_admin', partnerId: 100 },
    });
    mockGetBusinessPartnerScope.mockResolvedValue([100]);

    mockPrisma.project.count.mockResolvedValue(1);
    mockPrisma.project.findMany.mockResolvedValue([
      {
        id: 1,
        businessId: 1,
        projectNo: 'PRJ-0001',
        projectSalesStatus: 'new',
        projectExpectedCloseMonth: '2025-06',
        projectAssignedUserName: '田中太郎',
        projectCustomData: { estimatedRevenue: 1000000 },
        updatedAt: new Date('2025-06-01T00:00:00Z'),
        business: {
          businessName: 'テスト事業',
          businessConfig: {
            revenueRecognition: {
              statusCode: 'won',
              amountField: 'estimatedRevenue',
              dateField: 'projectExpectedCloseMonth',
            },
            projectFields: [],
          },
        },
        customer: { customerName: 'テスト顧客' },
      },
    ]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([
      {
        businessId: 1,
        statusCode: 'new',
        statusLabel: '新規',
        statusColor: '#3B82F6',
      },
    ]);

    const response = await GET(createRequest('/api/v1/portal/projects?businessId=1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    expect(body.data).toHaveLength(1);
    const project = body.data[0];
    expect(project.projectNo).toBe('PRJ-0001');
    expect(project.customerName).toBe('テスト顧客');
    expect(project.businessName).toBe('テスト事業');
    expect(project.projectSalesStatusLabel).toBe('新規');
    expect(project.projectSalesStatusColor).toBe('#3B82F6');

    expect(body.meta).toEqual({
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    expect(body).toHaveProperty('statusDefinitions');
    expect(body).toHaveProperty('fieldDefinitions');
  });

  // ========================================
  // フィルター・検索テスト
  // ========================================

  it('ステータスフィルターが適用される', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 10, role: 'partner_admin', partnerId: 100 },
    });
    mockGetBusinessPartnerScope.mockResolvedValue([100]);
    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    await GET(createRequest('/api/v1/portal/projects?statuses=new,proposal'));

    const countCall = mockPrisma.project.count.mock.calls[0][0];
    expect(countCall.where.projectSalesStatus).toEqual({ in: ['new', 'proposal'] });
  });

  it('テキスト検索がOR条件で適用される', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 10, role: 'partner_admin', partnerId: 100 },
    });
    mockGetBusinessPartnerScope.mockResolvedValue([100]);
    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    await GET(createRequest('/api/v1/portal/projects?search=テスト'));

    const countCall = mockPrisma.project.count.mock.calls[0][0];
    expect(countCall.where.OR).toBeDefined();
    expect(countCall.where.OR).toHaveLength(3);
  });
});
