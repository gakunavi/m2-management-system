import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// 画面から MO番号を変えたときの挙動
//
// ML連携（PATCH /api/integrations/customers/{customer_code}）と同じ共通処理
// （src/lib/customer-update.ts の applyCustomerUpdate）を通ることを、画面の
// エンドポイント越しに確かめる。
// ============================================================================

const { mockGetServerSession, mockPrisma } = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    mockGetServerSession: vi.fn(),
    mockPrisma: {
      user: model(),
      customer: model(),
      customerBusinessLink: model(),
      business: model(),
      industry: model(),
      integrationOutboxEvent: model(),
      $transaction: vi.fn(),
    },
  };
});

vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { PATCH } from '@/app/api/v1/customers/[id]/route';
import { POST } from '@/app/api/v1/customers/route';

const BASE = 'https://manage.example.test';
const LIGHT_BUSINESS_ID = 5;

function patchRequest(body: unknown): NextRequest {
  return new NextRequest(`${BASE}/api/v1/customers/11`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest(`${BASE}/api/v1/customers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: '11' }) };

/** formatCustomer が触る項目を埋めた更新後の顧客 */
function updatedCustomer() {
  return {
    id: 11,
    customerCode: 'CST-0001',
    customerName: 'テスト商事',
    customerSalutation: null,
    customerType: '法人',
    customerPostalCode: null,
    customerAddress: null,
    customerPhone: null,
    customerFax: null,
    customerEmail: null,
    customerWebsite: null,
    industryId: null,
    industry: null,
    customerCorporateNumber: null,
    customerInvoiceNumber: null,
    customerCapital: null,
    customerEstablishedDate: null,
    customerFolderUrl: null,
    customerFiscalMonth: null,
    customerNotes: null,
    customerCustomData: {},
    customerIsActive: true,
    version: 3,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-06T01:00:00.000Z'),
    createdBy: 1,
    updatedBy: 1,
    contacts: [],
    businessLinks: [],
  };
}

/** MO番号が MO-0001 の顧客を、その番号が空いている状態で用意する */
function stubCustomer(linkCustomData: Record<string, unknown> = { mo_no: 'MO-0001' }) {
  mockGetServerSession.mockResolvedValue({
    user: { id: 1, role: 'admin', userName: '石井' },
  });
  mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
  mockPrisma.customer.findUnique.mockResolvedValue({
    version: 2,
    customerIsActive: true,
    customerName: 'テスト商事',
    customerPhone: null,
    customerCustomData: {},
  });
  // 同名＋同電話の重複チェック（where.id が {not: …}）は「重複なし」
  mockPrisma.customer.findFirst.mockResolvedValue(null);
  mockPrisma.customer.update.mockResolvedValue(updatedCustomer());
  mockPrisma.customerBusinessLink.findUnique.mockResolvedValue({ id: 77, linkCustomData });
  // MO番号の重複チェックは「空いている」
  mockPrisma.customerBusinessLink.findFirst.mockResolvedValue(null);
  mockPrisma.customerBusinessLink.update.mockResolvedValue({ id: 77 });
  mockPrisma.customerBusinessLink.findMany.mockResolvedValue([
    { businessId: LIGHT_BUSINESS_ID, linkCustomData },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = BASE;
  process.env.INTEGRATION_BUSINESS_CODE = 'LIGHT';
  delete process.env.ML_WEBHOOK_URL;
  delete process.env.ML_WEBHOOK_SECRET;
});

describe('画面から MO番号を変えたとき', () => {
  it('前の番号が履歴に残る（ML から直したときと同じ処理）', async () => {
    stubCustomer({ mo_no: 'MO-0001', machine_count: 2 });

    const res = await PATCH(
      patchRequest({
        version: 2,
        businessId: LIGHT_BUSINESS_ID,
        linkCustomData: { mo_no: 'MO-0002' },
      }),
      params,
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.customerBusinessLink.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: {
        linkCustomData: { mo_no: 'MO-0002', mo_no_history: ['MO-0001'], machine_count: 2 },
      },
    });
  });

  it('何回変えても前の番号が全部残る', async () => {
    stubCustomer({ mo_no: 'MO-0003', mo_no_history: ['MO-0001', 'MO-0002'] });

    await PATCH(
      patchRequest({
        version: 2,
        businessId: LIGHT_BUSINESS_ID,
        linkCustomData: { mo_no: 'MO-0004' },
      }),
      params,
    );

    const data = mockPrisma.customerBusinessLink.update.mock.calls[0][0].data as {
      linkCustomData: Record<string, unknown>;
    };
    expect(data.linkCustomData.mo_no_history).toEqual(['MO-0001', 'MO-0002', 'MO-0003']);
  });

  it('他の顧客が使っている番号は止める（顧客本体も更新しない）', async () => {
    stubCustomer();
    mockPrisma.customerBusinessLink.findFirst.mockResolvedValue({
      linkCustomData: { mo_no: 'MO-0002' },
      customer: { customerCode: 'CST-0002' },
    });

    const res = await PATCH(
      patchRequest({
        version: 2,
        businessId: LIGHT_BUSINESS_ID,
        linkCustomData: { mo_no: 'MO-0002' },
      }),
      params,
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details[0].field).toBe('mo_no');
    expect(json.error.details[0].message).toContain('CST-0002');
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    expect(mockPrisma.customerBusinessLink.update).not.toHaveBeenCalled();
  });

  it('他の顧客が過去に使った番号も止める', async () => {
    stubCustomer();
    mockPrisma.customerBusinessLink.findFirst.mockResolvedValue({
      linkCustomData: { mo_no: 'MO-0009', mo_no_history: ['MO-0002'] },
      customer: { customerCode: 'CST-0002' },
    });

    const res = await PATCH(
      patchRequest({
        version: 2,
        businessId: LIGHT_BUSINESS_ID,
        linkCustomData: { mo_no: 'MO-0002' },
      }),
      params,
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.details[0].message).toContain('過去に使用');
  });

  it('MO番号以外の事業別項目だけを直すときは重複チェックをしない', async () => {
    stubCustomer();

    await PATCH(
      patchRequest({
        version: 2,
        businessId: LIGHT_BUSINESS_ID,
        linkCustomData: { machine_count: 4 },
      }),
      params,
    );

    expect(mockPrisma.customerBusinessLink.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.customerBusinessLink.update).toHaveBeenCalled();
  });

  it('ML管理システムへ customer.updated を知らせる', async () => {
    stubCustomer();
    process.env.ML_WEBHOOK_URL = 'https://ml.example.test/webhooks/m2';
    process.env.ML_WEBHOOK_SECRET = 'shhh';
    mockPrisma.business.findFirst.mockResolvedValue({ id: LIGHT_BUSINESS_ID, businessCode: 'LIGHT' });
    // 通知の対象判定（ライト事業に紐づく顧客か）。where.id が数値のときはこちら
    mockPrisma.customer.findFirst.mockImplementation((args: { where?: { id?: unknown } }) =>
      Promise.resolve(typeof args?.where?.id === 'number' ? { customerCode: 'CST-0001' } : null),
    );
    mockPrisma.integrationOutboxEvent.create.mockResolvedValue({ id: 1 });
    mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([]);

    const res = await PATCH(
      patchRequest({
        version: 2,
        businessId: LIGHT_BUSINESS_ID,
        linkCustomData: { mo_no: 'MO-0002' },
      }),
      params,
    );

    expect(res.status).toBe(200);
    const data = mockPrisma.integrationOutboxEvent.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.eventType).toBe('customer.updated');
    expect(data.customerCode).toBe('CST-0001');
  });
});

describe('画面から MO番号つきで顧客を新規作成したとき', () => {
  function stubCreate() {
    mockGetServerSession.mockResolvedValue({ user: { id: 1, role: 'admin', userName: '石井' } });
    mockPrisma.customer.findFirst.mockImplementation((args: { where?: Record<string, unknown> }) => {
      const where = args?.where ?? {};
      // 顧客コードの採番（CST-#### の最大値を引く）
      if ((where.customerCode as { startsWith?: string } | undefined)?.startsWith === 'CST-') {
        return Promise.resolve({ customerCode: 'CST-0100' });
      }
      return Promise.resolve(null);
    });
    mockPrisma.business.findUnique.mockResolvedValue({
      id: LIGHT_BUSINESS_ID,
      businessIsActive: true,
    });
    mockPrisma.customer.create.mockResolvedValue(updatedCustomer());
    mockPrisma.customerBusinessLink.findUnique.mockResolvedValue(null);
    mockPrisma.customerBusinessLink.create.mockResolvedValue({ id: 78 });
    mockPrisma.customerBusinessLink.findMany.mockResolvedValue([]);
    mockPrisma.customerBusinessLink.findFirst.mockResolvedValue(null);
  }

  it('他の顧客が使っている番号なら作らせない', async () => {
    stubCreate();
    mockPrisma.customerBusinessLink.findFirst.mockResolvedValue({
      linkCustomData: { mo_no: 'MO-0002' },
      customer: { customerCode: 'CST-0002' },
    });

    const res = await POST(
      postRequest({
        customerName: 'よその商事',
        businessId: LIGHT_BUSINESS_ID,
        linkCustomData: { mo_no: 'MO-0002' },
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.details[0].field).toBe('mo_no');
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it('空いている番号なら作れて、前後の空白は落ちる', async () => {
    stubCreate();

    const res = await POST(
      postRequest({
        customerName: '新しい商事',
        businessId: LIGHT_BUSINESS_ID,
        linkCustomData: { mo_no: ' MO-0002 ' },
      }),
    );

    expect(res.status).toBe(201);
    const data = mockPrisma.customerBusinessLink.create.mock.calls[0][0].data as {
      linkCustomData: Record<string, unknown>;
    };
    expect(data.linkCustomData.mo_no).toBe('MO-0002');
  });
});
