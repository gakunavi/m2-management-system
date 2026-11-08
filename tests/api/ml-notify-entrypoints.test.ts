import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// 作成・取り込み・一括操作の入口から ML へ知らせが出ること
//
// これまで `project.updated` が出るのは applyProjectUpdate（画面と ML の PATCH）
// だけで、新規作成・CSV取り込み・コピー・一括削除では出ていなかった
// （2026-11-08 石井さん）。ML は知らせで来たまだ無い案件を、内諾・申請中・購入済み
// ならその場で入れるので、作成の知らせが無いと写しができない。
//
// 入口ごとに「積まれる」「ML 由来では積まれない」「ライト事業以外では積まれない」を
// 固定する。
// ============================================================================

const { mockGetServerSession, mockPrisma } = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
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
      business: model(),
      businessStatusDefinition: model(),
      project: model(),
      projectMovement: model(),
      movementTemplate: model(),
      customer: model(),
      customerContact: model(),
      industry: model(),
      customerBusinessLink: model(),
      userBusinessAssignment: model(),
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
vi.mock('@/lib/project-helpers', () => ({
  generateProjectNo: vi.fn().mockResolvedValue('LIGHT-0099'),
  createInitialMovements: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/revenue-confirm-latch', () => ({
  latchRevenueConfirmation: vi.fn().mockResolvedValue({ latched: 0 }),
}));
vi.mock('@/lib/format-project', () => ({
  formatProject: (p: Record<string, unknown>) => ({ id: p.id, projectNo: p.projectNo }),
}));
vi.mock('@/lib/format-customer', () => ({
  formatCustomer: (c: Record<string, unknown>) => ({ id: c.id }),
}));

import { POST as PROJECT_POST } from '@/app/api/v1/projects/route';
import { POST as PROJECT_COPY } from '@/app/api/v1/projects/[id]/copy/route';
import { POST as PROJECT_BATCH } from '@/app/api/v1/projects/batch/route';
import { DELETE as PROJECT_DELETE } from '@/app/api/v1/projects/[id]/route';
import { PATCH as PROJECT_RESTORE } from '@/app/api/v1/projects/[id]/restore/route';
import { POST as PROJECT_CSV } from '@/app/api/v1/projects/csv/route';
import { POST as CUSTOMER_BATCH } from '@/app/api/v1/customers/batch/route';
import { POST as CUSTOMER_CSV } from '@/app/api/v1/customers/csv/route';
import { POST as MOVEMENT_SYNC } from '@/app/api/v1/businesses/[id]/movement-templates/sync/route';
import {
  notifyProjectsChangedToMl,
  notifyCustomersChangedToMl,
  notifyCustomerLinkChangedToMl,
} from '@/lib/ml-scope';
import { userActor, mlActorFromRequest } from '@/lib/update-actor';

const LIGHT = { id: 5, businessCode: 'LIGHT' };
const OTHER_BUSINESS_ID = 1;
const ADMIN = { id: 1, role: 'admin', userName: '石井' };

/** 積まれた控え（eventType と案件No/顧客コード）を取り出す */
function queued(): Array<{ eventType: string; projectNo: string | null; customerCode: string | null }> {
  const calls = mockPrisma.integrationOutboxEvent.create.mock.calls as Array<
    [{ data: Record<string, unknown> }]
  >;
  return calls.map((c) => ({
    eventType: c[0].data.eventType as string,
    projectNo: (c[0].data.projectNo ?? null) as string | null,
    customerCode: (c[0].data.customerCode ?? null) as string | null,
  }));
}

function request(url: string, options: { method?: string; body?: unknown } = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options.method ?? 'POST',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

/** CSV取り込みのリクエスト（multipart） */
function csvRequest(url: string, csv: string, extra: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  form.set('file', new File([csv], 'import.csv', { type: 'text/csv' }));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return new NextRequest(new URL(url, 'http://localhost:3000'), { method: 'POST', body: form });
}

function mlActor() {
  const result = mlActorFromRequest(
    new NextRequest('https://manage.example.test/api/integrations/projects/LIGHT-0077', {
      method: 'PATCH',
      headers: { 'x-ml-user': encodeURIComponent('山田太郎') },
    }),
  );
  if (!result.ok) throw new Error('actor');
  return result.actor;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTEGRATION_BUSINESS_CODE = 'LIGHT';
  process.env.ML_WEBHOOK_URL = 'https://ml.example.test/webhooks/m2';
  process.env.ML_WEBHOOK_SECRET = 'shhh';

  mockGetServerSession.mockResolvedValue({ user: ADMIN });
  // resolveImportBusiness（ライト事業の解決）
  mockPrisma.business.findFirst.mockResolvedValue(LIGHT);
  mockPrisma.integrationOutboxEvent.create.mockResolvedValue({ id: 1 });
  // 送信 sweep（レスポンス後に走る）は空で返す
  mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(
    (fn: (tx: typeof mockPrisma) => unknown) => (typeof fn === 'function' ? fn(mockPrisma) : fn),
  );
});

// ============================================================================
// 1. まとめて通知する入口（CSV取り込み・一括操作が使う）
// ============================================================================

describe('notifyProjectsChangedToMl（案件をまとめて）', () => {
  it('ライト事業の案件だけ、件数ぶん1通ずつ積む', async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      { projectNo: 'LIGHT-0001' },
      { projectNo: 'LIGHT-0002' },
    ]);

    await notifyProjectsChangedToMl(mockPrisma as never, userActor(ADMIN), [1, 2, 3]);

    expect(queued()).toEqual([
      { eventType: 'project.updated', projectNo: 'LIGHT-0001', customerCode: null },
      { eventType: 'project.updated', projectNo: 'LIGHT-0002', customerCode: null },
    ]);
    // 事業の判定は1回だけ（取り込み件数ぶん問い合わせない）
    const where = mockPrisma.project.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.businessId).toBe(LIGHT.id);
    // 論理削除済みも対象（消したことを知らせるため）
    expect('projectIsActive' in where).toBe(false);
  });

  it('ML 由来なら積まない（ループ防止）', async () => {
    await notifyProjectsChangedToMl(mockPrisma as never, mlActor(), [1, 2]);
    expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
    expect(queued()).toEqual([]);
  });

  it('通知先が未設定なら積まない', async () => {
    delete process.env.ML_WEBHOOK_URL;
    await notifyProjectsChangedToMl(mockPrisma as never, userActor(ADMIN), [1]);
    expect(queued()).toEqual([]);
  });

  it('ライト事業の案件が1件も無ければ積まない', async () => {
    mockPrisma.project.findMany.mockResolvedValue([]);
    await notifyProjectsChangedToMl(mockPrisma as never, userActor(ADMIN), [1, 2]);
    expect(queued()).toEqual([]);
  });
});

describe('notifyCustomersChangedToMl（顧客をまとめて）', () => {
  it('ライト事業に紐づく顧客だけ1通ずつ積む', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([
      { customerCode: 'CST-0001' },
      { customerCode: 'CST-0002' },
    ]);

    await notifyCustomersChangedToMl(mockPrisma as never, userActor(ADMIN), {
      customerIds: [11, 12, 13],
      kind: 'contacts',
    });

    expect(queued()).toEqual([
      { eventType: 'customer.contacts.updated', projectNo: null, customerCode: 'CST-0001' },
      { eventType: 'customer.contacts.updated', projectNo: null, customerCode: 'CST-0002' },
    ]);
  });

  it('ML 由来なら積まない', async () => {
    await notifyCustomersChangedToMl(mockPrisma as never, mlActor(), {
      customerIds: [11],
      kind: 'customer',
    });
    expect(queued()).toEqual([]);
  });
});

describe('notifyCustomerLinkChangedToMl（事業リンク）', () => {
  it('リンクが消えたあとでも customer.updated を積む', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ customerCode: 'CST-0001' });

    await notifyCustomerLinkChangedToMl(mockPrisma as never, userActor(ADMIN), {
      businessId: LIGHT.id,
      customerId: 11,
    });

    expect(queued()).toEqual([
      { eventType: 'customer.updated', projectNo: null, customerCode: 'CST-0001' },
    ]);
    // リンクの有無では絞らない（絞ると「消えた」を知らせられない）
    const where = mockPrisma.customer.findUnique.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).toEqual({ id: 11 });
  });

  it('ライト事業以外のリンクでは積まない', async () => {
    await notifyCustomerLinkChangedToMl(mockPrisma as never, userActor(ADMIN), {
      businessId: OTHER_BUSINESS_ID,
      customerId: 11,
    });
    expect(queued()).toEqual([]);
  });
});

// ============================================================================
// 2. 案件の入口
// ============================================================================

describe('POST /api/v1/projects（新規作成）', () => {
  function stub(businessId = LIGHT.id) {
    mockPrisma.business.findUnique.mockResolvedValue({
      id: businessId,
      businessIsActive: true,
      businessConfig: {},
    });
    mockPrisma.customer.findFirst.mockResolvedValue({ id: 11, customerIsActive: true });
    mockPrisma.businessStatusDefinition.findFirst.mockResolvedValue({
      statusCode: 'informal_approval',
      statusLabel: '3_内諾',
    });
    mockPrisma.project.create.mockResolvedValue({
      id: 123,
      projectNo: 'LIGHT-0099',
      businessId,
      projectSalesStatus: 'informal_approval',
    });
    mockPrisma.customerBusinessLink.upsert.mockResolvedValue({});
  }

  const body = {
    businessId: LIGHT.id,
    customerId: 11,
    projectSalesStatus: 'informal_approval',
  };

  it('ライト事業の案件を作ると project.updated を積む', async () => {
    stub();

    const res = await PROJECT_POST(request('/api/v1/projects', { body }));

    expect(res.status).toBe(201);
    expect(queued()).toEqual([
      { eventType: 'project.updated', projectNo: 'LIGHT-0099', customerCode: null },
    ]);
  });

  it('ライト事業以外では積まない', async () => {
    stub(OTHER_BUSINESS_ID);

    const res = await PROJECT_POST(
      request('/api/v1/projects', { body: { ...body, businessId: OTHER_BUSINESS_ID } }),
    );

    // 作成自体は成功している（通知だけ出ない）
    expect(res.status).toBe(201);
    expect(queued()).toEqual([]);
  });

  it('通知先が未設定なら積まない', async () => {
    delete process.env.ML_WEBHOOK_SECRET;
    stub();

    const res = await PROJECT_POST(request('/api/v1/projects', { body }));

    expect(res.status).toBe(201);
    expect(queued()).toEqual([]);
  });
});

describe('POST /api/v1/projects/:id/copy（コピー）', () => {
  function stub(businessId = LIGHT.id) {
    mockPrisma.project.findUnique
      .mockResolvedValueOnce({
        id: 1,
        businessId,
        customerId: 11,
        partnerId: null,
        projectNo: 'LIGHT-0001',
        projectSalesStatus: 'informal_approval',
        projectCustomData: {},
        rewardOverride: null,
        companyShareOverride: null,
        stockTermMonths: null,
      })
      // レスポンス用の再取得
      .mockResolvedValue({ id: 456, projectNo: 'LIGHT-0100' });
    mockPrisma.business.findFirst.mockImplementation((args: { where?: { id?: number } }) =>
      Promise.resolve(args?.where?.id ? { id: businessId, businessConfig: {} } : LIGHT),
    );
    mockPrisma.project.create.mockResolvedValue({
      id: 456,
      projectNo: 'LIGHT-0100',
      businessId,
    });
    mockPrisma.customerBusinessLink.upsert.mockResolvedValue({});
  }

  it('コピーでできた案件も project.updated を積む', async () => {
    stub();

    const res = await PROJECT_COPY(request('/api/v1/projects/1/copy'), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(res.status).toBe(201);
    expect(queued()).toEqual([
      { eventType: 'project.updated', projectNo: 'LIGHT-0100', customerCode: null },
    ]);
  });

  it('ライト事業以外では積まない', async () => {
    stub(OTHER_BUSINESS_ID);

    const res = await PROJECT_COPY(request('/api/v1/projects/1/copy'), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(res.status).toBe(201);
    expect(queued()).toEqual([]);
  });
});

describe('POST /api/v1/projects/batch（一括削除）', () => {
  it('実際に消えた案件だけ1通ずつ積む', async () => {
    mockPrisma.project.findMany
      // 消す対象の控え
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      // 通知の中で引く案件No
      .mockResolvedValueOnce([{ projectNo: 'LIGHT-0001' }, { projectNo: 'LIGHT-0002' }]);
    mockPrisma.project.updateMany.mockResolvedValue({ count: 2 });

    const res = await PROJECT_BATCH(
      request('/api/v1/projects/batch', { body: { action: 'delete', ids: [1, 2, 3] } }),
    );

    expect(res.status).toBe(200);
    expect(queued()).toEqual([
      { eventType: 'project.updated', projectNo: 'LIGHT-0001', customerCode: null },
      { eventType: 'project.updated', projectNo: 'LIGHT-0002', customerCode: null },
    ]);
    // 控えは更新の前に取る（updateMany は対象の行を返さない）
    const targetWhere = mockPrisma.project.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(targetWhere.projectIsActive).toBe(true);
  });

  it('消える案件が無ければ積まない', async () => {
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.project.updateMany.mockResolvedValue({ count: 0 });

    const res = await PROJECT_BATCH(
      request('/api/v1/projects/batch', { body: { action: 'delete', ids: [9] } }),
    );

    expect(res.status).toBe(200);
    expect(queued()).toEqual([]);
  });
});

describe('案件の単体削除・復元', () => {
  it('削除で project.updated を積む（ML は読み直して 404 で消えたと分かる）', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: 1,
      projectNo: 'LIGHT-0001',
      businessId: LIGHT.id,
      projectIsActive: true,
    });
    mockPrisma.project.update.mockResolvedValue({});

    const res = await PROJECT_DELETE(
      request('/api/v1/projects/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) },
    );

    expect(res.status).toBe(200);
    expect(queued()).toEqual([
      { eventType: 'project.updated', projectNo: 'LIGHT-0001', customerCode: null },
    ]);
  });

  it('復元でも積む', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: 1,
      projectNo: 'LIGHT-0001',
      businessId: LIGHT.id,
      projectIsActive: false,
    });
    mockPrisma.project.update.mockResolvedValue({});

    const res = await PROJECT_RESTORE(
      request('/api/v1/projects/1/restore', { method: 'PATCH' }),
      { params: Promise.resolve({ id: '1' }) },
    );

    expect(res.status).toBe(200);
    expect(queued()).toEqual([
      { eventType: 'project.updated', projectNo: 'LIGHT-0001', customerCode: null },
    ]);
  });
});

// ============================================================================
// 3. 顧客の入口
// ============================================================================

describe('POST /api/v1/customers/batch（一括削除）', () => {
  it('実際に消えた顧客だけ1通ずつ積む', async () => {
    mockPrisma.customer.findMany
      .mockResolvedValueOnce([{ id: 11 }, { id: 12 }])
      .mockResolvedValueOnce([{ customerCode: 'CST-0001' }, { customerCode: 'CST-0002' }]);
    mockPrisma.customer.updateMany.mockResolvedValue({ count: 2 });

    const res = await CUSTOMER_BATCH(
      request('/api/v1/customers/batch', { body: { action: 'delete', ids: [11, 12] } }),
    );

    expect(res.status).toBe(200);
    expect(queued()).toEqual([
      { eventType: 'customer.updated', projectNo: null, customerCode: 'CST-0001' },
      { eventType: 'customer.updated', projectNo: null, customerCode: 'CST-0002' },
    ]);
  });
});

// ============================================================================
// 4. 段階（ムーブメント）の一括同期
// ============================================================================

describe('POST /api/v1/businesses/:id/movement-templates/sync', () => {
  function stub(businessId = LIGHT.id) {
    mockPrisma.business.findUnique.mockResolvedValue({ id: businessId, businessIsActive: true });
    mockPrisma.movementTemplate.findMany
      .mockResolvedValueOnce([{ id: 77 }])
      .mockResolvedValueOnce([]);
    mockPrisma.project.findMany
      // 事業内の全案件
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      // 通知の中で引く案件No
      .mockResolvedValueOnce([{ projectNo: 'LIGHT-0001' }, { projectNo: 'LIGHT-0002' }]);
    mockPrisma.projectMovement.createMany.mockResolvedValue({ count: 2 });
  }

  it('段階の構成が変わったら案件ごとに project.movements.updated を積む', async () => {
    stub();

    const res = await MOVEMENT_SYNC(request('/api/v1/businesses/5/movement-templates/sync'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(res.status).toBe(200);
    expect(queued()).toEqual([
      { eventType: 'project.movements.updated', projectNo: 'LIGHT-0001', customerCode: null },
      { eventType: 'project.movements.updated', projectNo: 'LIGHT-0002', customerCode: null },
    ]);
  });

  it('何も増減しなければ積まない', async () => {
    mockPrisma.business.findUnique.mockResolvedValue({ id: LIGHT.id, businessIsActive: true });
    mockPrisma.movementTemplate.findMany.mockResolvedValue([]);
    mockPrisma.project.findMany.mockResolvedValue([{ id: 1 }]);

    const res = await MOVEMENT_SYNC(request('/api/v1/businesses/5/movement-templates/sync'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(res.status).toBe(200);
    expect(queued()).toEqual([]);
  });
});

// ============================================================================
// 5. CSV取り込み
// ============================================================================

describe('POST /api/v1/projects/csv（案件のCSV取り込み）', () => {
  const CSV = ['顧客コード,営業ステータス', 'CST-0001,3_内諾'].join('\n');

  function stub(businessId = LIGHT.id) {
    // business.findFirst は2通り: 取り込み先の事業（where.id）と
    // ライト事業の解決（where.businessCode）
    mockPrisma.business.findFirst.mockImplementation((args: { where?: { id?: number } }) =>
      Promise.resolve(args?.where?.id ? { id: businessId, businessConfig: {} } : LIGHT),
    );
    mockPrisma.businessStatusDefinition.findMany.mockResolvedValue([
      { statusCode: 'informal_approval', statusLabel: '3_内諾' },
    ]);
    mockPrisma.customer.findFirst.mockResolvedValue({ id: 11 });
    mockPrisma.project.create.mockResolvedValue({ id: 201, projectNo: 'LIGHT-0201' });
    mockPrisma.customerBusinessLink.upsert.mockResolvedValue({});
    mockPrisma.project.findMany.mockResolvedValue([{ projectNo: 'LIGHT-0201' }]);
  }

  it('取り込んだ案件ごとに project.updated を積む', async () => {
    stub();

    const res = await PROJECT_CSV(
      csvRequest('/api/v1/projects/csv', CSV, { businessId: String(LIGHT.id), mode: 'create_only' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.created).toBe(1);
    expect(queued()).toEqual([
      { eventType: 'project.updated', projectNo: 'LIGHT-0201', customerCode: null },
    ]);
  });

  it('ドライランでは積まない（中身をロールバックするため）', async () => {
    stub();

    const res = await PROJECT_CSV(
      csvRequest('/api/v1/projects/csv', CSV, {
        businessId: String(LIGHT.id),
        mode: 'create_only',
        dryRun: 'true',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.dryRun).toBe(true);
    expect(queued()).toEqual([]);
  });

  it('ライト事業以外では積まない', async () => {
    stub(OTHER_BUSINESS_ID);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await PROJECT_CSV(
      csvRequest('/api/v1/projects/csv', CSV, {
        businessId: String(OTHER_BUSINESS_ID),
        mode: 'create_only',
      }),
    );

    expect(res.status).toBe(200);
    expect(queued()).toEqual([]);
  });
});

describe('POST /api/v1/customers/csv（顧客のCSV取り込み）', () => {
  it('顧客と担当者それぞれに1通ずつ積む', async () => {
    mockPrisma.industry.findMany.mockResolvedValue([]);
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockPrisma.customer.create.mockResolvedValue({ id: 11 });
    mockPrisma.customerContact.findFirst.mockResolvedValue(null);
    mockPrisma.customerContact.create.mockResolvedValue({ id: 31 });
    mockPrisma.customer.findMany.mockResolvedValue([{ customerCode: 'CST-0001' }]);

    const csv = ['顧客コード,顧客名,主担当者名', 'CST-0001,テスト商事,鈴木花子'].join('\n');
    const res = await CUSTOMER_CSV(csvRequest('/api/v1/customers/csv', csv));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.created).toBe(1);
    expect(queued()).toEqual([
      { eventType: 'customer.updated', projectNo: null, customerCode: 'CST-0001' },
      { eventType: 'customer.contacts.updated', projectNo: null, customerCode: 'CST-0001' },
    ]);
  });

  it('ドライランでは積まない', async () => {
    mockPrisma.industry.findMany.mockResolvedValue([]);
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockPrisma.customer.create.mockResolvedValue({ id: 11 });
    mockPrisma.customer.findMany.mockResolvedValue([{ customerCode: 'CST-0001' }]);

    const csv = ['顧客コード,顧客名', 'CST-0001,テスト商事'].join('\n');
    const res = await CUSTOMER_CSV(csvRequest('/api/v1/customers/csv', csv, { dryRun: 'true' }));

    expect(res.status).toBe(200);
    expect(queued()).toEqual([]);
  });
});
