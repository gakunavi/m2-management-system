import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// vi.hoisted でモック変数を先に定義（ホイスティング対応）
// ============================================

const { mockGetServerSession, mockPrisma } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPrisma: {
    business: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    project: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    userBusinessAssignment: {
      findMany: vi.fn(),
    },
    salesTarget: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    businessStatusDefinition: {
      findMany: vi.fn(),
    },
  },
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

vi.mock('@/lib/revenue-helpers', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/revenue-helpers')>();
  return {
    ...orig,
    calculateMonthRevenue: vi.fn().mockResolvedValue({ actualAmount: 0, projectCount: 0 }),
    calculateKpiBatchForBusiness: vi.fn().mockResolvedValue(new Map()),
    getBusinessIdsForUser: vi.fn().mockResolvedValue(null),
  };
});

import { GET } from '@/app/api/v1/dashboard/summary/route';

// ============================================
// ヘルパー
// ============================================

function createRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

// ============================================
// ダッシュボード summary テスト
// ============================================

describe('GET /api/v1/dashboard/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未認証の場合は 401 を返す', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET(createRequest('/api/v1/dashboard/summary'));

    expect(response.status).toBe(401);
  });

  it('admin は全事業のサマリーを取得できる', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });

    mockPrisma.business.findMany.mockResolvedValue([
      {
        id: 1,
        businessName: 'テスト事業',
        businessConfig: {
          revenueRecognition: {
            statusCode: 'won',
            amountField: 'estimatedRevenue',
            dateField: 'projectExpectedCloseMonth',
          },
        },
      },
    ]);

    mockPrisma.project.count.mockResolvedValue(10);
    mockPrisma.salesTarget.findMany.mockResolvedValue([]);

    const response = await GET(createRequest('/api/v1/dashboard/summary'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalProjects');
    // businessSummaries は targetBusinessId === null（全体モード）のときのみ
    expect(body.data).toHaveProperty('businessSummaries');
  });

  it('特定事業のフィルター（businessId パラメータ）', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });

    mockPrisma.business.findMany.mockResolvedValue([
      {
        id: 2,
        businessName: '特定事業',
        businessConfig: {},
      },
    ]);
    mockPrisma.project.count.mockResolvedValue(5);
    mockPrisma.salesTarget.findMany.mockResolvedValue([]);

    const response = await GET(createRequest('/api/v1/dashboard/summary?businessId=2'));
    const body = await response.json();

    expect(response.status).toBe(200);
    // 特定事業フィルター時は businessSummaries は含まれない
    expect(body.data.businessSummaries).toBeUndefined();
    expect(body.data.totalProjects.current).toBe(5);
  });

  it('レスポンスに必要なフィールドが含まれる', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });

    mockPrisma.business.findMany.mockResolvedValue([
      {
        id: 1,
        businessName: '事業A',
        businessConfig: {},
      },
    ]);
    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.salesTarget.findMany.mockResolvedValue([]);

    const response = await GET(createRequest('/api/v1/dashboard/summary'));
    const body = await response.json();

    const data = body.data;
    // 4大カード: revenue, achievementRate, totalProjects, wonProjects
    expect(data).toHaveProperty('currentMonth');
    expect(data).toHaveProperty('revenue');
    expect(data).toHaveProperty('achievementRate');
    expect(data).toHaveProperty('totalProjects');
    expect(typeof data.totalProjects.current).toBe('number');
    expect(data).toHaveProperty('wonProjects');

    // 全体モード時は businessSummaries が含まれる
    expect(data).toHaveProperty('businessSummaries');
    expect(Array.isArray(data.businessSummaries)).toBe(true);

    if (data.businessSummaries.length > 0) {
      const biz = data.businessSummaries[0];
      expect(biz).toHaveProperty('businessId');
      expect(biz).toHaveProperty('businessName');
      expect(biz).toHaveProperty('projectCount');
      expect(biz).toHaveProperty('actualAmount');
    }
  });
});
