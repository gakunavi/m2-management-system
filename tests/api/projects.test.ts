import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// vi.hoisted でモック変数を先に定義（ホイスティング対応）
// ============================================

const { mockGetServerSession, mockPrisma } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockPrisma: {
    project: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    business: {
      findFirst: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    partner: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    userBusinessAssignment: {
      findMany: vi.fn(),
    },
    businessStatusDefinition: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
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

vi.mock('@/lib/project-helpers', () => ({
  generateProjectNo: vi.fn().mockResolvedValue('PRJ-0001'),
  createInitialMovements: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/format-project', () => ({
  formatProject: (p: Record<string, unknown>) => ({
    id: p.id,
    projectNo: p.projectNo,
    projectSalesStatus: p.projectSalesStatus,
  }),
}));

import { GET, POST } from '@/app/api/v1/projects/route';

// ============================================
// ヘルパー
// ============================================

function createRequest(url: string, options?: { method?: string; body?: string }) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options);
}

// ============================================
// GET /api/v1/projects テスト
// ============================================

describe('GET /api/v1/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未認証の場合は 401 を返す', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const request = createRequest('/api/v1/projects?businessId=1');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('admin は全案件を取得できる', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });
    mockPrisma.project.count.mockResolvedValue(1);
    mockPrisma.project.findMany.mockResolvedValue([
      {
        id: 1,
        businessId: 1,
        projectNo: 'PRJ-0001',
        projectSalesStatus: 'new',
        projectExpectedCloseMonth: '2025-06',
        projectAssignedUserName: '田中太郎',
        projectCustomData: {},
        updatedAt: new Date(),
        customer: { id: 1, customerCode: 'CST-0001', customerName: 'テスト顧客' },
        partner: null,
        business: { id: 1, businessName: 'テスト事業' },
        assignedUser: null,
      },
    ]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    const request = createRequest('/api/v1/projects?businessId=1');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
    expect(body.meta.page).toBe(1);
  });

  it('staff はアサイン事業のみに制限される', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 2, role: 'staff' },
    });
    mockPrisma.userBusinessAssignment.findMany.mockResolvedValue([
      { businessId: 1 },
      { businessId: 3 },
    ]);
    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    const request = createRequest('/api/v1/projects');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockPrisma.userBusinessAssignment.findMany).toHaveBeenCalledWith({
      where: { userId: 2 },
      select: { businessId: true },
    });
  });

  it('partner_staff は自分担当分のみに制限される', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 5, role: 'partner_staff', partnerId: 10 },
    });
    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    const request = createRequest('/api/v1/projects');
    await GET(request);

    const countCall = mockPrisma.project.count.mock.calls[0][0];
    expect(countCall.where.projectAssignedUserId).toBe(5);
  });

  it('ページネーションが正しく動作する', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });
    mockPrisma.project.count.mockResolvedValue(50);
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    const request = createRequest('/api/v1/projects?businessId=1&page=3&pageSize=10');
    const response = await GET(request);
    const body = await response.json();

    expect(body.meta.page).toBe(3);
    expect(body.meta.pageSize).toBe(10);
    expect(body.meta.totalPages).toBe(5);
  });

  it('pageSize の上限は 100', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });
    mockPrisma.project.count.mockResolvedValue(0);
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([]);

    const request = createRequest('/api/v1/projects?businessId=1&pageSize=999');
    const response = await GET(request);
    const body = await response.json();

    expect(body.meta.pageSize).toBe(100);
  });
});

// ============================================
// POST /api/v1/projects テスト
// ============================================

describe('POST /api/v1/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未認証の場合は 401 を返す', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const request = createRequest('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('partner ロールは 403 を返す', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 5, role: 'partner_admin' },
    });

    const request = createRequest('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        businessId: 1,
        customerId: 1,
        projectSalesStatus: 'new',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it('必須フィールド不足は 400 バリデーションエラー', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });

    const request = createRequest('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('正常な作成は 201 を返す', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });
    mockPrisma.business.findFirst.mockResolvedValue({ id: 1, businessIsActive: true });
    mockPrisma.customer.findFirst.mockResolvedValue({ id: 1, customerIsActive: true });
    mockPrisma.businessStatusDefinition.findFirst.mockResolvedValue({
      statusCode: 'new',
      statusLabel: '新規',
    });

    const createdProject = {
      id: 1,
      projectNo: 'PRJ-0001',
      projectSalesStatus: 'new',
    };
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        project: {
          create: vi.fn().mockResolvedValue(createdProject),
          findMany: vi.fn().mockResolvedValue([]),
        },
        businessStep: { findMany: vi.fn().mockResolvedValue([]) },
        projectMovement: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      });
    });

    const request = createRequest('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        businessId: 1,
        customerId: 1,
        projectSalesStatus: 'new',
      }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.projectNo).toBe('PRJ-0001');
  });

  it('存在しない事業 ID は 400 エラー', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });
    mockPrisma.business.findFirst.mockResolvedValue(null);

    const request = createRequest('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        businessId: 999,
        customerId: 1,
        projectSalesStatus: 'new',
      }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain('事業');
  });

  it('projectExpectedCloseMonth の不正なフォーマットは 400', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 1, role: 'admin' },
    });

    const request = createRequest('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        businessId: 1,
        customerId: 1,
        projectSalesStatus: 'new',
        projectExpectedCloseMonth: '2025/06',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
