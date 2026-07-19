import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

// ============================================
// POST /api/v1/rewards/statements（締め・確定）ルートテスト
// ============================================
// 実DB制約(P2002)そのものはモックで再現できないが、ルートが
// 「一意制約違反(P2002)を 409 に変換し、他エラーは 500 に伝播する」という
// 並行確定の安全経路を検証する。金額集計・採番は純粋関数（reward-helpers）で
// 別途単体テスト済みのため、ここではオーケストレーションと分岐に絞る。

const { mockGetServerSession, mockPrisma, mockGetRewardEntriesForPeriod } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetRewardEntriesForPeriod: vi.fn(),
  mockPrisma: {
    business: { findUnique: vi.fn() },
    partner: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// getRewardConfig / computeStatementTotals / generateStatementNo は本物を使い、
// DB依存の getRewardEntriesForPeriod だけモックする
vi.mock('@/lib/reward-helpers', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/reward-helpers')>();
  return {
    ...orig,
    getRewardEntriesForPeriod: (...args: unknown[]) => mockGetRewardEntriesForPeriod(...args),
  };
});

import { POST } from '@/app/api/v1/rewards/statements/route';

function postRequest(body: unknown) {
  return new NextRequest(new URL('/api/v1/rewards/statements', 'http://localhost:3000'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { businessId: 1, partnerId: 1, periodMonth: '2026-07' };

function setupHappyMocks() {
  mockGetServerSession.mockResolvedValue({ user: { id: 9, role: 'admin' } });
  mockPrisma.business.findUnique.mockResolvedValue({
    id: 1,
    businessCode: 'moag',
    businessConfig: { rewardConfig: { defaults: {}, taxRate: 10, paymentTiming: 'same' } },
  });
  mockPrisma.partner.findUnique.mockResolvedValue({ id: 1, partnerCode: 'AG-0001' });
  mockGetRewardEntriesForPeriod.mockResolvedValue([
    { partnerId: 1, entryType: 'direct', rewardKind: 'shot', rewardAmount: 675000, projectId: 8, projectNo: 'MG-0008', customerName: '株式会社ビルドアップ', sourceMonth: '2026-07', sourcePartnerId: null, baseAmount: 4500000, rewardType: 'rate', rate: 15 },
  ]);
}

describe('POST /api/v1/rewards/statements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未認証は 401', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('代理店ロールは 403（社内ユーザー限定）', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 2, role: 'partner_admin' } });
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('periodMonth 形式不正は 400', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 9, role: 'admin' } });
    const res = await POST(postRequest({ ...VALID_BODY, periodMonth: '2026/07' }));
    expect(res.status).toBe(400);
  });

  it('正常時は 201 で明細書を作成し、集計が正しい', async () => {
    setupHappyMocks();
    let captured: Record<string, unknown> | null = null;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        rewardStatement: {
          create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            captured = data;
            return { id: 1, ...data, entries: [] };
          }),
        },
      }),
    );

    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    // 集計: 直675,000 / 小計675,000 / 税10%67,500 / 合計742,500
    expect(captured).toMatchObject({
      status: 'confirmed',
      statementNo: 'moag-202607-AG-0001',
      totalDirect: 675000,
      totalIndirect: 0,
      subtotal: 675000,
      taxAmount: 67500,
      grandTotal: 742500,
      confirmedBy: 9,
    });
  });

  it('一意制約違反(P2002)は 409 に変換（二重/同時確定の防止）', async () => {
    setupHappyMocks();
    mockPrisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(409);
  });

  it('P2002 以外の DB エラーは 500 に伝播（握り潰さない）', async () => {
    setupHappyMocks();
    mockPrisma.$transaction.mockRejectedValue(new Error('connection lost'));

    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });
});
