import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// モック定義
// ============================================

const { mockPrisma, mockBuildSnapshot, mockCreateNotifications } = vi.hoisted(() => {
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
    mockPrisma: {
      business: model(),
      businessStatusDefinition: model(),
      customer: model(),
      customerBusinessLink: model(),
      customerContact: model(),
      customerContactBusinessLink: model(),
      project: model(),
      integrationIdempotencyKey: model(),
      integrationChangeLog: model(),
      integrationOutboxEvent: model(),
      $transaction: vi.fn(),
    },
    mockBuildSnapshot: vi.fn(),
    mockCreateNotifications: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/reward-helpers', () => ({ buildRewardSnapshotForProject: mockBuildSnapshot }));
vi.mock('@/lib/notification-helper', () => ({
  createNotificationsForUsers: mockCreateNotifications,
}));

import { GET as PROJECT_GET, PATCH as PROJECT_PATCH } from '@/app/api/integrations/projects/[projectNo]/route';
import { PATCH as CUSTOMER_PATCH } from '@/app/api/integrations/customers/[id]/route';
import {
  GET as CONTACTS_GET,
  POST as CONTACTS_POST,
} from '@/app/api/integrations/customers/[id]/contacts/route';
import {
  PATCH as CONTACT_PATCH,
  DELETE as CONTACT_DELETE,
} from '@/app/api/integrations/customers/[id]/contacts/[contactId]/route';
import { CONTACT_FORBIDDEN_KEYS, CONTACT_ITEM_KEYS } from '@/lib/integration-contacts-read';
import { ML_PROJECT_ITEM_KEYS } from '@/lib/ml-project-fields';
import { ML_CUSTOMER_ITEM_KEYS } from '@/lib/ml-customer-fields';

const READ_TOKEN = 'readonly-token-xyz';
const WRITE_TOKEN = 'write-token-abc';
const BASE = 'https://manage.example.test';
const LIGHT_BUSINESS = { id: 5, businessCode: 'LIGHT' };

const STATUS_DEFS: Record<string, { statusLabel: string; isRevenueConfirmed: boolean }> = {
  informal_approval: { statusLabel: '3_内諾', isRevenueConfirmed: false },
  purchased: { statusLabel: '1_購入済み', isRevenueConfirmed: true },
};

function request(
  path: string,
  options: { method?: string; token?: string | null; mlUser?: string | null; body?: unknown; idempotencyKey?: string } = {},
): NextRequest {
  const headers: Record<string, string> = { 'x-forwarded-proto': 'https' };
  if (options.token !== null) headers.authorization = `Bearer ${options.token ?? WRITE_TOKEN}`;
  if (options.mlUser !== null) headers['x-ml-user'] = encodeURIComponent(options.mlUser ?? '山田太郎');
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  return new NextRequest(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

const projectParams = (projectNo = 'LIGHT-0077') => ({ params: Promise.resolve({ projectNo }) });
const customerParams = (id = 'CST-0001') => ({ params: Promise.resolve({ id }) });
const contactParams = (id = 'CST-0001', contactId = '31') => ({
  params: Promise.resolve({ id, contactId }),
});

/** ライト事業・案件・顧客が見つかる状態にする */
function stubLightScope() {
  mockPrisma.business.findFirst.mockResolvedValue(LIGHT_BUSINESS);
  mockPrisma.business.findUnique.mockResolvedValue({
    businessConfig: {
      projectFields: [
        { key: 'unit_count', label: '台数', type: 'number' },
        { key: 'purchase_unit_price', label: '購入単価', type: 'number' },
        // ライト事業の購入金額は「購入単価 × 台数」の数式項目
        { key: 'purchase_amount', label: '購入金額', type: 'formula', formula: 'purchase_unit_price * unit_count' },
      ],
    },
  });
  mockPrisma.project.findFirst.mockResolvedValue({
    id: 123,
    projectNo: 'LIGHT-0077',
    customer: { id: 11, customerCode: 'CST-0001' },
  });
  mockPrisma.customer.findFirst.mockResolvedValue({ id: 11, customerCode: 'CST-0001' });
  mockPrisma.businessStatusDefinition.findFirst.mockImplementation(
    ({ where }: { where: { statusCode: string } }) => {
      const def = STATUS_DEFS[where.statusCode];
      return Promise.resolve(def ? { ...def, statusCode: where.statusCode, statusColor: null } : null);
    },
  );
}

function existingProject(over: Record<string, unknown> = {}) {
  return {
    id: 123,
    version: 4,
    projectSalesStatus: 'informal_approval',
    projectCustomData: { needs: 'A_節税', unit_count: 5, purchase_unit_price: 2_400_000 },
    businessId: 5,
    revenueConfirmedAt: null,
    partnerId: 9,
    ...over,
  };
}

function updatedProject(over: Record<string, unknown> = {}) {
  return {
    id: 123,
    projectNo: 'LIGHT-0077',
    projectSalesStatus: 'informal_approval',
    projectStatusChangedAt: new Date('2026-11-05T01:00:00.000Z'),
    projectCustomData: { needs: 'A_節税', unit_count: 8, purchase_unit_price: 2_400_000 },
    projectAssignedUserId: 42,
    businessId: 5,
    version: 5,
    rewardSnapshot: null,
    customer: { id: 11, customerCode: 'CST-0001', businessLinks: [], customerCustomData: {} },
    partner: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTEGRATION_API_TOKEN = WRITE_TOKEN;
  process.env.INTEGRATION_READONLY_TOKEN = READ_TOKEN;
  process.env.INTEGRATION_BUSINESS_CODE = 'LIGHT';
  process.env.NEXTAUTH_URL = BASE;
  delete process.env.INTEGRATION_IP_ALLOWLIST;
  // 通知は既定で無効（env 未設定＝no-op）。通知のテストは ml-notify.test.ts
  delete process.env.ML_WEBHOOK_URL;
  delete process.env.ML_WEBHOOK_SECRET;

  mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue(null);
  mockPrisma.integrationIdempotencyKey.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.integrationIdempotencyKey.upsert.mockResolvedValue({});
  mockPrisma.integrationChangeLog.create.mockResolvedValue({ id: 1 });
  mockBuildSnapshot.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.INTEGRATION_API_TOKEN;
  delete process.env.INTEGRATION_READONLY_TOKEN;
});

// ============================================================================
// 1. トークン種別ごとの 401
// ============================================================================

describe('認証（トークンの種別）', () => {
  it('担当者の読み出しは読み取り用トークンで通る', async () => {
    stubLightScope();
    mockPrisma.customer.findUnique.mockResolvedValue({ version: 2 });
    mockPrisma.customerContact.findMany.mockResolvedValue([]);

    const res = await CONTACTS_GET(
      request('/api/integrations/customers/CST-0001/contacts', { token: READ_TOKEN }),
      customerParams(),
    );
    expect(res.status).toBe(200);
  });

  it('担当者の読み出しは書き込み用トークンでは 401', async () => {
    stubLightScope();
    const res = await CONTACTS_GET(
      request('/api/integrations/customers/CST-0001/contacts', { token: WRITE_TOKEN }),
      customerParams(),
    );
    expect(res.status).toBe(401);
  });

  it('案件PATCH は読み取り用トークンでは 401', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        token: READ_TOKEN,
        body: { version: 4, unit_count: 8 },
      }),
      projectParams(),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  it('顧客PATCH は読み取り用トークンでは 401', async () => {
    stubLightScope();
    const res = await CUSTOMER_PATCH(
      request('/api/integrations/customers/CST-0001', {
        method: 'PATCH',
        token: READ_TOKEN,
        body: { version: 2, company_name: 'テスト商事' },
      }),
      customerParams(),
    );
    expect(res.status).toBe(401);
  });

  it('担当者の追加は読み取り用トークンでは 401', async () => {
    stubLightScope();
    const res = await CONTACTS_POST(
      request('/api/integrations/customers/CST-0001/contacts', {
        method: 'POST',
        token: READ_TOKEN,
        body: { contactName: '鈴木花子' },
      }),
      customerParams(),
    );
    expect(res.status).toBe(401);
  });

  it('401 のときは DB を一切引かない（未認証リクエストで DB を叩かせない）', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        token: 'wrong-token',
        body: { version: 4, unit_count: 8 },
      }),
      projectParams(),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.project.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.business.findFirst).not.toHaveBeenCalled();
  });

  it('トークン無しは 401', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        token: null,
        body: { version: 4 },
      }),
      projectParams(),
    );
    expect(res.status).toBe(401);
  });

  it('案件の読み出しは読み取り用トークンで通り、書き込み用では 401', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue({
      ...updatedProject(),
      customer: { customerCode: 'CST-0001' },
    });

    const ok = await PROJECT_GET(
      request('/api/integrations/projects/LIGHT-0077', { token: READ_TOKEN }),
      projectParams(),
    );
    expect(ok.status).toBe(200);

    const ng = await PROJECT_GET(
      request('/api/integrations/projects/LIGHT-0077', { token: WRITE_TOKEN }),
      projectParams(),
    );
    expect(ng.status).toBe(401);
  });

  it('X-ML-User が無ければ 422（誰が直したか分からない変更を残さない）', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        mlUser: null,
        body: { version: 4, unit_count: 8 },
      }),
      projectParams(),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors[0].field).toBe('x-ml-user');
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 2. ライト事業でない案件・顧客への操作が 404
// ============================================================================

describe('対象外（ライト事業でない）', () => {
  it('ライト事業でない案件の PATCH は 404', async () => {
    mockPrisma.business.findFirst.mockResolvedValue(LIGHT_BUSINESS);
    // businessId で絞った findFirst が当たらない＝他事業の案件
    mockPrisma.project.findFirst.mockResolvedValue(null);

    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/MG-0001', {
        method: 'PATCH',
        body: { version: 1, unit_count: 2 },
      }),
      projectParams('MG-0001'),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  it('ライト事業に紐づかない顧客の PATCH は 404', async () => {
    mockPrisma.business.findFirst.mockResolvedValue(LIGHT_BUSINESS);
    mockPrisma.customer.findFirst.mockResolvedValue(null);

    const res = await CUSTOMER_PATCH(
      request('/api/integrations/customers/CST-9999', {
        method: 'PATCH',
        body: { version: 1, company_name: 'よその商事' },
      }),
      customerParams('CST-9999'),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it('ライト事業に紐づかない顧客の担当者読み出しは 404', async () => {
    mockPrisma.business.findFirst.mockResolvedValue(LIGHT_BUSINESS);
    mockPrisma.customer.findFirst.mockResolvedValue(null);

    const res = await CONTACTS_GET(
      request('/api/integrations/customers/CST-9999/contacts', { token: READ_TOKEN }),
      customerParams('CST-9999'),
    );
    expect(res.status).toBe(404);
  });

  it('404 は冪等キーに記録しない（後で事業に紐づけたら通るようにする）', async () => {
    mockPrisma.business.findFirst.mockResolvedValue(LIGHT_BUSINESS);
    mockPrisma.project.findFirst.mockResolvedValue(null);

    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/MG-0001', {
        method: 'PATCH',
        body: { version: 1, unit_count: 2 },
        idempotencyKey: 'ml-edit-404',
      }),
      projectParams('MG-0001'),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.integrationIdempotencyKey.upsert).not.toHaveBeenCalled();
  });

  it('ライト事業に紐づかない顧客への担当者追加は 404', async () => {
    mockPrisma.business.findFirst.mockResolvedValue(LIGHT_BUSINESS);
    mockPrisma.customer.findFirst.mockResolvedValue(null);

    const res = await CONTACTS_POST(
      request('/api/integrations/customers/CST-9999/contacts', {
        method: 'POST',
        body: { contactName: '鈴木花子' },
      }),
      customerParams('CST-9999'),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 3. 409（先に更新されていた）
// ============================================================================

describe('409（楽観ロック）', () => {
  it('案件: version が古ければ 409 と現在値を返す', async () => {
    stubLightScope();
    mockPrisma.project.findUnique
      // applyProjectUpdate の既存取得（version 7 ＝ 送られた 4 より進んでいる）
      .mockResolvedValueOnce(existingProject({ version: 7 }))
      // 409 の current 用
      .mockResolvedValueOnce({
        ...updatedProject({ version: 7 }),
        customer: { customerCode: 'CST-0001' },
      });

    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, unit_count: 8 },
      }),
      projectParams(),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Conflict');
    expect(body.current.version).toBe(7);
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  it('顧客: version が古ければ 409 と現在値を返す', async () => {
    stubLightScope();
    mockPrisma.customer.findUnique
      .mockResolvedValueOnce({
        version: 9,
        customerIsActive: true,
        customerName: '元の名前',
        customerPhone: null,
        customerCustomData: {},
      })
      .mockResolvedValueOnce({
        id: 11,
        customerCode: 'CST-0001',
        customerName: '元の名前',
        customerType: '法人',
        version: 9,
      });

    const res = await CUSTOMER_PATCH(
      request('/api/integrations/customers/CST-0001', {
        method: 'PATCH',
        body: { version: 2, company_name: '新しい名前' },
      }),
      customerParams(),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.current.version).toBe(9);
    expect(body.current.company_name).toBe('元の名前');
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it('担当者: updated_at が現在値と違えば 409', async () => {
    stubLightScope();
    const now = new Date('2026-11-05T02:00:00.000Z');
    mockPrisma.customerContact.findFirst
      .mockResolvedValueOnce({ id: 31, customerId: 11, contactIsPrimary: false, updatedAt: now })
      .mockResolvedValueOnce({
        id: 31,
        contactName: '鈴木花子',
        contactDepartment: null,
        contactPosition: null,
        contactIsRepresentative: false,
        contactIsPrimary: false,
        contactPhone: null,
        contactFax: null,
        contactEmail: null,
        contactBusinessCardFrontUrl: null,
        contactBusinessCardBackUrl: null,
        updatedAt: now,
        businessLinks: [],
      });

    const res = await CONTACT_PATCH(
      request('/api/integrations/customers/CST-0001/contacts/31', {
        method: 'PATCH',
        body: { updated_at: '2026-11-04T00:00:00.000Z', contactName: '鈴木一郎' },
      }),
      contactParams(),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.current.updated_at).toBe(now.toISOString());
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('担当者: updated_at が一致すれば更新できる', async () => {
    stubLightScope();
    const now = new Date('2026-11-05T02:00:00.000Z');
    mockPrisma.customerContact.findFirst.mockResolvedValue({
      id: 31,
      customerId: 11,
      contactIsPrimary: false,
      updatedAt: now,
    });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      mockPrisma.customerContact.findUnique.mockResolvedValue({
        id: 31,
        contactName: '鈴木一郎',
        contactDepartment: null,
        contactPosition: null,
        contactIsRepresentative: false,
        contactIsPrimary: false,
        contactPhone: null,
        contactFax: null,
        contactEmail: null,
        contactBusinessCardFrontUrl: null,
        contactBusinessCardBackUrl: null,
        updatedAt: new Date('2026-11-05T03:00:00.000Z'),
        businessLinks: [],
      });
      return fn(mockPrisma);
    });

    const res = await CONTACT_PATCH(
      request('/api/integrations/customers/CST-0001/contacts/31', {
        method: 'PATCH',
        body: { updated_at: now.toISOString(), contactName: '鈴木一郎' },
      }),
      contactParams(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contact_name).toBe('鈴木一郎');
    // 楽観ロックのトークンは更新項目として渡さない
    const updateArgs = mockPrisma.customerContact.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateArgs).not.toHaveProperty('updated_at');
    expect(updateArgs).not.toHaveProperty('updatedAt');
  });
});

// ============================================================================
// 4. 422（バリデーション違反）
// ============================================================================

describe('422（バリデーション違反）', () => {
  it('知らないキーは 422（ML側のタイプミスを黙って捨てない）', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, unit_counts: 8 },
      }),
      projectParams(),
    );
    expect(res.status).toBe(422);
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  it('日付の形式違反は 422 と理由を返す', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, sales_contract_date: '2026/11/05' },
      }),
      projectParams(),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.errors[0].field).toBe('sales_contract_date');
    expect(body.errors[0].message).toContain('YYYY-MM-DD');
  });

  it('負の台数は 422', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, unit_count: -1 },
      }),
      projectParams(),
    );
    expect(res.status).toBe(422);
  });

  it('version が無ければ 422', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { unit_count: 8 },
      }),
      projectParams(),
    );
    expect(res.status).toBe(422);
  });

  it('計算項目（購入金額）の更新は 422（黙って消えるのを避ける）', async () => {
    stubLightScope();
    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, purchase_amount: 19_200_000 },
      }),
      projectParams(),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors[0].field).toBe('purchase_amount');
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  it('存在しない営業ステータスは 422', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    // statusIsActive の確認で見つからない
    mockPrisma.businessStatusDefinition.findFirst.mockResolvedValue(null);

    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, status_code: 'no_such_status' },
      }),
      projectParams(),
    );
    expect(res.status).toBe(422);
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  it('顧客: 知らないキーは 422', async () => {
    stubLightScope();
    const res = await CUSTOMER_PATCH(
      request('/api/integrations/customers/CST-0001', {
        method: 'PATCH',
        body: { version: 2, customer_address: '東京都目黒区' },
      }),
      customerParams(),
    );
    expect(res.status).toBe(422);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it('顧客: 法人区分の値違反は 422', async () => {
    stubLightScope();
    const res = await CUSTOMER_PATCH(
      request('/api/integrations/customers/CST-0001', {
        method: 'PATCH',
        body: { version: 2, customer_type: 'corporation' },
      }),
      customerParams(),
    );
    expect(res.status).toBe(422);
  });

  it('担当者: 担当者名が空なら 422', async () => {
    stubLightScope();
    const res = await CONTACTS_POST(
      request('/api/integrations/customers/CST-0001/contacts', {
        method: 'POST',
        body: { contactName: '' },
      }),
      customerParams(),
    );
    expect(res.status).toBe(422);
  });

  it('壊れた JSON は 400', async () => {
    stubLightScope();
    const req = new NextRequest(`${BASE}/api/integrations/projects/LIGHT-0077`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${WRITE_TOKEN}`,
        'x-forwarded-proto': 'https',
        'x-ml-user': encodeURIComponent('山田太郎'),
      },
      body: '{ broken',
    });
    const res = await PROJECT_PATCH(req, projectParams());
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// 5. 冪等（同一リクエスト2回で1回だけ反映）
// ============================================================================

describe('冪等（Idempotency-Key）', () => {
  it('同じキー＋同じ内容の再送では DB を触らず前回のレスポンスを返す', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockPrisma.project.update.mockResolvedValue(updatedProject());

    // 1回目: 記録が無いので実際に更新し、保存されたハッシュとレスポンスを採取する
    let saved: { requestHash: string; statusCode: number; responseBody: unknown } | null = null;
    mockPrisma.integrationIdempotencyKey.upsert.mockImplementation(
      (args: { create: { requestHash: string; statusCode: number; responseBody: unknown } }) => {
        saved = args.create;
        return Promise.resolve({});
      },
    );

    const body = { version: 4, unit_count: 8 };
    const first = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body,
        idempotencyKey: 'ml-edit-0001',
      }),
      projectParams(),
    );
    expect(first.status).toBe(200);
    expect(mockPrisma.project.update).toHaveBeenCalledTimes(1);
    expect(saved).not.toBeNull();

    // 2回目: 1回目と同じキー・同じ内容。記録が返る
    mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue({
      ...saved!,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const second = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body,
        idempotencyKey: 'ml-edit-0001',
      }),
      projectParams(),
    );

    expect(second.status).toBe(200);
    expect(second.headers.get('Idempotent-Replay')).toBe('true');
    expect(await second.json()).toEqual(saved!.responseBody);
    // 2回目は DB を変更していない＝1回だけ反映
    expect(mockPrisma.project.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.integrationChangeLog.create).toHaveBeenCalledTimes(1);
  });

  it('同じキーで内容が違えば 409（呼び出し側のキー生成バグを黙って飲み込まない）', async () => {
    stubLightScope();
    mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue({
      requestHash: 'some-other-hash',
      statusCode: 200,
      responseBody: {},
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, unit_count: 9 },
        idempotencyKey: 'ml-edit-0001',
      }),
      projectParams(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('Idempotency-Key conflict');
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
  });

  it('同じキーで別のリソースを更新しようとしたら 409（リソースもハッシュに含める）', async () => {
    stubLightScope();
    let savedHash = '';
    mockPrisma.integrationIdempotencyKey.upsert.mockImplementation((args: { create: { requestHash: string } }) => {
      savedHash = args.create.requestHash;
      return Promise.resolve({});
    });
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockPrisma.project.update.mockResolvedValue(updatedProject());

    const body = { version: 4, unit_count: 8 };
    await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body,
        idempotencyKey: 'ml-edit-0002',
      }),
      projectParams(),
    );

    // 別の案件Noを同じキーで
    mockPrisma.project.findFirst.mockResolvedValue({
      id: 124,
      projectNo: 'LIGHT-0078',
      customer: { id: 11, customerCode: 'CST-0001' },
    });
    mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue({
      requestHash: savedHash,
      statusCode: 200,
      responseBody: {},
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0078', {
        method: 'PATCH',
        body,
        idempotencyKey: 'ml-edit-0002',
      }),
      projectParams('LIGHT-0078'),
    );
    expect(res.status).toBe(409);
  });

  it('担当者の削除も再送で 204 を返す（2回目は DB を触らない）', async () => {
    stubLightScope();
    mockPrisma.customerContact.findFirst.mockResolvedValue({
      id: 31,
      customerId: 11,
      updatedAt: new Date('2026-11-05T02:00:00.000Z'),
    });
    mockPrisma.customerContact.delete.mockResolvedValue({});

    let saved: { requestHash: string; statusCode: number; responseBody: unknown } | null = null;
    mockPrisma.integrationIdempotencyKey.upsert.mockImplementation(
      (args: { create: { requestHash: string; statusCode: number; responseBody: unknown } }) => {
        saved = args.create;
        return Promise.resolve({});
      },
    );

    const first = await CONTACT_DELETE(
      request('/api/integrations/customers/CST-0001/contacts/31', {
        method: 'DELETE',
        idempotencyKey: 'ml-del-0001',
      }),
      contactParams(),
    );
    expect(first.status).toBe(204);
    expect(mockPrisma.customerContact.delete).toHaveBeenCalledTimes(1);
    expect(saved!.statusCode).toBe(204);

    mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue({
      ...saved!,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const second = await CONTACT_DELETE(
      request('/api/integrations/customers/CST-0001/contacts/31', {
        method: 'DELETE',
        idempotencyKey: 'ml-del-0001',
      }),
      contactParams(),
    );
    expect(second.status).toBe(204);
    expect(second.headers.get('Idempotent-Replay')).toBe('true');
    // 2回目は削除していない（既に消えている行を再度消そうとして 404 にもならない）
    expect(mockPrisma.customerContact.delete).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// 6. 画面と同じ更新処理が通ること（ステータス変更の副作用）
// ============================================================================

describe('画面と同じ更新処理（ステータス変更の副作用）', () => {
  it('収益確定ステータスへの変更で確定日がセットされ、手数料が凍結される', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockBuildSnapshot.mockResolvedValue({ chain: [], companyShare: { type: 'rate', value: 20 } });
    mockPrisma.project.update.mockResolvedValue(
      updatedProject({ projectSalesStatus: 'purchased', version: 5 }),
    );

    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, status_code: 'purchased' },
      }),
      projectParams(),
    );
    expect(res.status).toBe(200);

    // 画面経由と同じラッチが走る
    expect(mockBuildSnapshot).toHaveBeenCalledTimes(1);
    expect(mockBuildSnapshot.mock.calls[0][1]).toMatchObject({
      businessId: 5,
      projectId: 123,
      capturedBy: 'confirm',
    });

    const data = mockPrisma.project.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.revenueConfirmedAt).toBeInstanceOf(Date);
    expect(data.projectStatusChangedAt).toBeInstanceOf(Date);
    expect(data.rewardSnapshot).toMatchObject({ companyShare: { type: 'rate', value: 20 } });
    // 楽観ロックも画面と同じ
    expect(data.version).toEqual({ increment: 1 });
    // ML は m2 のユーザーではないので updated_by には載せない
    expect(data.updatedBy).toBeNull();
  });

  it('ステータスが変わらない更新ではラッチも通知も走らない', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockPrisma.project.update.mockResolvedValue(updatedProject());

    await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, unit_count: 8 },
      }),
      projectParams(),
    );

    expect(mockBuildSnapshot).not.toHaveBeenCalled();
    const data = mockPrisma.project.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.projectStatusChangedAt).toBeUndefined();
    expect(data.revenueConfirmedAt).toBeUndefined();
  });

  it('ステータス変更で社内主担当者へ通知が飛ぶ', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockPrisma.project.update.mockResolvedValue(
      updatedProject({ projectSalesStatus: 'purchased', projectAssignedUserId: 42 }),
    );
    mockCreateNotifications.mockResolvedValue(undefined);

    await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, status_code: 'purchased' },
      }),
      projectParams(),
    );

    // 通知は非ブロッキング（void）なのでマイクロタスクを一度流す
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCreateNotifications).toHaveBeenCalledTimes(1);
    expect(mockCreateNotifications.mock.calls[0][0]).toEqual([42]);
    expect(mockCreateNotifications.mock.calls[0][1]).toMatchObject({
      type: 'status_change',
      relatedEntity: 'project',
      relatedEntityId: 123,
    });
  });

  it('案件カスタム項目はマージ更新（送っていない項目が消えない）', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockPrisma.project.update.mockResolvedValue(updatedProject());

    await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, unit_count: 8 },
      }),
      projectParams(),
    );

    const data = mockPrisma.project.update.mock.calls[0][0].data as {
      projectCustomData: Record<string, unknown>;
    };
    expect(data.projectCustomData.unit_count).toBe(8);
    // 送っていない既存値はそのまま
    expect(data.projectCustomData.needs).toBe('A_節税');
    expect(data.projectCustomData.purchase_unit_price).toBe(2_400_000);
    // 数式項目は m2 側で再計算される
    expect(data.projectCustomData.purchase_amount).toBe(19_200_000);
  });

  it('ML の unit_price は purchase_unit_price に保存される', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockPrisma.project.update.mockResolvedValue(updatedProject());

    await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, unit_price: 2_500_000 },
      }),
      projectParams(),
    );

    const data = mockPrisma.project.update.mock.calls[0][0].data as {
      projectCustomData: Record<string, unknown>;
    };
    expect(data.projectCustomData.purchase_unit_price).toBe(2_500_000);
    expect(data.projectCustomData).not.toHaveProperty('unit_price');
  });

  it('顧客PATCH でも画面と同じ重複チェックが効く', async () => {
    stubLightScope();
    mockPrisma.customer.findUnique.mockResolvedValue({
      version: 2,
      customerIsActive: true,
      customerName: '元の名前',
      customerPhone: '03-1234-5678',
      customerCustomData: {},
    });
    // 同名＋同電話の別顧客が既にいる
    mockPrisma.customer.findFirst
      .mockResolvedValueOnce({ id: 11, customerCode: 'CST-0001' })
      .mockResolvedValueOnce({ id: 22, customerCode: 'CST-0002', customerName: 'テスト商事' });

    const res = await CUSTOMER_PATCH(
      request('/api/integrations/customers/CST-0001', {
        method: 'PATCH',
        body: { version: 2, company_name: 'テスト商事' },
      }),
      customerParams(),
    );

    expect(res.status).toBe(409);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it('担当者の追加で主担当を立てると、既存の主担当が降りる（1人まで）', async () => {
    stubLightScope();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      mockPrisma.customerContact.create.mockResolvedValue({ id: 32 });
      mockPrisma.customerContact.findUnique.mockResolvedValue({
        id: 32,
        contactName: '鈴木花子',
        contactDepartment: null,
        contactPosition: null,
        contactIsRepresentative: false,
        contactIsPrimary: true,
        contactPhone: null,
        contactFax: null,
        contactEmail: null,
        contactBusinessCardFrontUrl: null,
        contactBusinessCardBackUrl: null,
        updatedAt: new Date('2026-11-05T03:00:00.000Z'),
        businessLinks: [],
      });
      return fn(mockPrisma);
    });

    const res = await CONTACTS_POST(
      request('/api/integrations/customers/CST-0001/contacts', {
        method: 'POST',
        body: { contactName: '鈴木花子', contactIsPrimary: true },
      }),
      customerParams(),
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.customerContact.updateMany).toHaveBeenCalledWith({
      where: { customerId: 11, contactIsPrimary: true },
      data: { contactIsPrimary: false },
    });
  });
});

// ============================================================================
// 7. 変更履歴に "ML：<名前>" が残る
// ============================================================================

describe('変更履歴', () => {
  it('案件の更新で "ML：<名前>" と項目名が残る（値は残さない）', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockPrisma.project.update.mockResolvedValue(updatedProject());

    await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        mlUser: '鈴木花子',
        body: { version: 4, unit_count: 8, needs: 'B_純投資' },
      }),
      projectParams(),
    );

    const data = mockPrisma.integrationChangeLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.actorLabel).toBe('ML：鈴木花子');
    expect(data.entityType).toBe('project');
    expect(data.entityKey).toBe('LIGHT-0077');
    expect(data.changedFields).toEqual(['needs', 'unit_count']);
    // 値は残さない
    expect(JSON.stringify(data)).not.toContain('B_純投資');
  });
});

// ============================================================================
// 8. 担当者の読み出し（返す／返さない項目）
// ============================================================================

describe('担当者の読み出し', () => {
  const CONTACT_ROW = {
    id: 31,
    contactName: '鈴木花子',
    contactDepartment: '総務部',
    contactPosition: '課長',
    contactIsRepresentative: false,
    contactIsPrimary: true,
    contactPhone: '03-1234-5678',
    contactFax: '03-1234-5679',
    contactEmail: 'suzuki@example.com',
    contactBusinessCardFrontUrl: 'uploads/cards/front.jpg',
    contactBusinessCardBackUrl: null,
    updatedAt: new Date('2026-11-05T02:00:00.000Z'),
    businessLinks: [{ business: { businessCode: 'LIGHT', businessName: 'ライト事業' } }],
  };

  it('キー集合が仕様と一致し、禁止キーを含まない', async () => {
    stubLightScope();
    mockPrisma.customer.findUnique.mockResolvedValue({ version: 2 });
    mockPrisma.customerContact.findMany.mockResolvedValue([CONTACT_ROW]);

    const res = await CONTACTS_GET(
      request('/api/integrations/customers/CST-0001/contacts', { token: READ_TOKEN }),
      customerParams(),
    );
    const body = await res.json();

    expect(Object.keys(body.items[0]).sort()).toEqual([...CONTACT_ITEM_KEYS].sort());
    for (const forbidden of CONTACT_FORBIDDEN_KEYS) {
      expect(body.items[0]).not.toHaveProperty(forbidden);
    }
  });

  it('名刺は有無だけを返し、画像URLは返さない', async () => {
    stubLightScope();
    mockPrisma.customer.findUnique.mockResolvedValue({ version: 2 });
    mockPrisma.customerContact.findMany.mockResolvedValue([CONTACT_ROW]);

    const res = await CONTACTS_GET(
      request('/api/integrations/customers/CST-0001/contacts', { token: READ_TOKEN }),
      customerParams(),
    );
    const body = await res.json();

    expect(body.items[0].has_business_card_front).toBe(true);
    expect(body.items[0].has_business_card_back).toBe(false);
    expect(JSON.stringify(body)).not.toContain('uploads/cards/front.jpg');
  });

  it('contactSortOrder → id の順で取る', async () => {
    stubLightScope();
    mockPrisma.customer.findUnique.mockResolvedValue({ version: 2 });
    mockPrisma.customerContact.findMany.mockResolvedValue([]);

    await CONTACTS_GET(
      request('/api/integrations/customers/CST-0001/contacts', { token: READ_TOKEN }),
      customerParams(),
    );
    expect(mockPrisma.customerContact.findMany.mock.calls[0][0].orderBy).toEqual([
      { contactSortOrder: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('顧客の画面URLと version を返す', async () => {
    stubLightScope();
    mockPrisma.customer.findUnique.mockResolvedValue({ version: 2 });
    mockPrisma.customerContact.findMany.mockResolvedValue([]);

    const res = await CONTACTS_GET(
      request('/api/integrations/customers/CST-0001/contacts', { token: READ_TOKEN }),
      customerParams(),
    );
    const body = await res.json();
    expect(body.customer).toEqual({
      customer_code: 'CST-0001',
      customer_url: `${BASE}/customers/11`,
      version: 2,
    });
  });
});

// ============================================================================
// 9. レスポンスのキー集合（仕様書とのドリフト検知）
// ============================================================================

describe('レスポンスのキー集合', () => {
  it('案件PATCH は仕様どおりのキーを返す（version を必ず含む）', async () => {
    stubLightScope();
    mockPrisma.project.findUnique.mockResolvedValue(existingProject());
    mockPrisma.project.update.mockResolvedValue(updatedProject());

    const res = await PROJECT_PATCH(
      request('/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        body: { version: 4, unit_count: 8 },
      }),
      projectParams(),
    );
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([...ML_PROJECT_ITEM_KEYS].sort());
    expect(body.version).toBe(5);
  });

  it('顧客PATCH は仕様どおりのキーを返し、住所・法人番号・口座を含まない', async () => {
    stubLightScope();
    mockPrisma.customer.findUnique.mockResolvedValue({
      version: 2,
      customerIsActive: true,
      customerName: '元の名前',
      customerPhone: null,
      customerCustomData: {},
    });
    mockPrisma.customer.update.mockResolvedValue({
      id: 11,
      customerCode: 'CST-0001',
      customerName: 'テスト商事',
      customerType: '法人',
      version: 3,
      businessLinks: [],
    });

    const res = await CUSTOMER_PATCH(
      request('/api/integrations/customers/CST-0001', {
        method: 'PATCH',
        body: { version: 2, company_name: 'テスト商事' },
      }),
      customerParams(),
    );
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([...ML_CUSTOMER_ITEM_KEYS].sort());
    expect(body.version).toBe(3);
  });
});
