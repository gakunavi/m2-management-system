import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// モック定義
// ============================================

const { mockPrisma } = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    mockPrisma: {
      business: model(),
      customer: model(),
      integrationOutboxEvent: model(),
      integrationChangeLog: model(),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import {
  ML_MAX_ATTEMPTS,
  ML_RETRY_DELAYS_SEC,
  deliverPendingMlNotifications,
  enqueueMlNotification,
  mlWebhookConfig,
  signMlPayload,
  verifyMlSignature,
} from '@/lib/ml-notify';
import { notifyCustomerChangedToMl, notifyProjectChangedToMl } from '@/lib/ml-scope';
import { mlActorFromRequest, userActor } from '@/lib/update-actor';
import { recordIntegrationChange, changedFieldNames } from '@/lib/integration-change-log';
import { NextRequest } from 'next/server';

const WEBHOOK_URL = 'https://ml.example.test/api/m2-events';
const WEBHOOK_SECRET = 'ml-webhook-secret-dummy';

const SCREEN_ACTOR = userActor({ id: 7, role: 'staff', userName: '営業部 佐藤' });
const ML_ACTOR = (() => {
  const request = new NextRequest('https://manage.example.test/x', {
    headers: { 'x-ml-user': encodeURIComponent('山田太郎') },
  });
  const result = mlActorFromRequest(request);
  if (!result.ok) throw new Error('fixture');
  return result.actor;
})();

/** ML連携対象（ライト事業）の解決を通す */
function stubLightBusiness() {
  mockPrisma.business.findFirst.mockResolvedValue({ id: 5, businessCode: 'LIGHT' });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ML_WEBHOOK_URL = WEBHOOK_URL;
  process.env.ML_WEBHOOK_SECRET = WEBHOOK_SECRET;
  mockPrisma.integrationOutboxEvent.create.mockResolvedValue({ id: 1 });
  mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([]);
  mockPrisma.integrationOutboxEvent.update.mockResolvedValue({});
  mockPrisma.integrationChangeLog.create.mockResolvedValue({ id: 1 });
});

afterEach(() => {
  delete process.env.ML_WEBHOOK_URL;
  delete process.env.ML_WEBHOOK_SECRET;
  vi.unstubAllGlobals();
});

// ============================================
// 設定（env）
// ============================================

describe('mlWebhookConfig', () => {
  it('URLと鍵が揃っているときだけ有効', () => {
    expect(mlWebhookConfig()).toEqual({ url: WEBHOOK_URL, secret: WEBHOOK_SECRET });
  });

  it('鍵が無ければ無効（no-op）', () => {
    delete process.env.ML_WEBHOOK_SECRET;
    expect(mlWebhookConfig()).toBeNull();
  });

  it('URLが無ければ無効（no-op）', () => {
    delete process.env.ML_WEBHOOK_URL;
    expect(mlWebhookConfig()).toBeNull();
  });
});

// ============================================
// ループ防止: ML から来た更新では通知しない
// ============================================

describe('ML由来の更新では通知しない（ループ防止）', () => {
  it('案件: 画面からの更新は控えを作る', async () => {
    stubLightBusiness();
    await notifyProjectChangedToMl(mockPrisma as never, SCREEN_ACTOR, {
      businessId: 5,
      projectNo: 'LIGHT-0077',
    });
    expect(mockPrisma.integrationOutboxEvent.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.integrationOutboxEvent.create.mock.calls[0][0].data).toMatchObject({
      eventType: 'project.updated',
      projectNo: 'LIGHT-0077',
    });
  });

  it('案件: ML からの更新では控えを作らない', async () => {
    stubLightBusiness();
    await notifyProjectChangedToMl(mockPrisma as never, ML_ACTOR, {
      businessId: 5,
      projectNo: 'LIGHT-0077',
    });
    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('顧客: ML からの更新では控えを作らない', async () => {
    stubLightBusiness();
    mockPrisma.customer.findFirst.mockResolvedValue({ customerCode: 'CST-0001' });
    await notifyCustomerChangedToMl(mockPrisma as never, ML_ACTOR, {
      customerId: 11,
      kind: 'customer',
    });
    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('担当者: 画面からの更新は contacts の種別で控えを作る', async () => {
    stubLightBusiness();
    mockPrisma.customer.findFirst.mockResolvedValue({ customerCode: 'CST-0001' });
    await notifyCustomerChangedToMl(mockPrisma as never, SCREEN_ACTOR, {
      customerId: 11,
      kind: 'contacts',
    });
    expect(mockPrisma.integrationOutboxEvent.create.mock.calls[0][0].data).toMatchObject({
      eventType: 'customer.contacts.updated',
      customerCode: 'CST-0001',
    });
  });

  it('ライト事業以外の案件では通知しない', async () => {
    stubLightBusiness();
    await notifyProjectChangedToMl(mockPrisma as never, SCREEN_ACTOR, {
      businessId: 99,
      projectNo: 'MG-0001',
    });
    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('ライト事業に紐づかない顧客では通知しない', async () => {
    stubLightBusiness();
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    await notifyCustomerChangedToMl(mockPrisma as never, SCREEN_ACTOR, {
      customerId: 11,
      kind: 'customer',
    });
    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('env 未設定なら控えも作らない（no-op）', async () => {
    delete process.env.ML_WEBHOOK_SECRET;
    stubLightBusiness();
    await notifyProjectChangedToMl(mockPrisma as never, SCREEN_ACTOR, {
      businessId: 5,
      projectNo: 'LIGHT-0077',
    });
    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });
});

// ============================================
// 通知本文に個人の値を入れない
// ============================================

describe('通知本文', () => {
  const PERSONAL_VALUES = [
    '山田太郎',
    'テスト商事',
    '03-1234-5678',
    'test@example.com',
    '東京都目黒区',
    '1234567890123',
    '1234567',
  ];

  it('控えには種別とキーしか持たない', async () => {
    stubLightBusiness();
    await notifyProjectChangedToMl(mockPrisma as never, SCREEN_ACTOR, {
      businessId: 5,
      projectNo: 'LIGHT-0077',
    });
    const data = mockPrisma.integrationOutboxEvent.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(Object.keys(data).sort()).toEqual(['customerCode', 'eventId', 'eventType', 'projectNo']);
  });

  it('送る本文は種別・キー・時刻だけで、個人の値・金額を含まない', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([
      {
        id: 1,
        eventId: 'ev-1',
        eventType: 'project.updated',
        projectNo: 'LIGHT-0077',
        customerCode: null,
        attempts: 0,
        createdAt: new Date('2026-11-05T01:00:00.000Z'),
      },
    ]);

    const result = await deliverPendingMlNotifications(mockPrisma as never);
    expect(result.sent).toBe(1);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual([
      'event_id',
      'event_type',
      'occurred_at',
      'project_no',
    ]);
    for (const value of PERSONAL_VALUES) {
      expect(init.body as string).not.toContain(value);
    }
  });

  it('顧客の通知は customer_code だけを載せる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([
      {
        id: 2,
        eventId: 'ev-2',
        eventType: 'customer.contacts.updated',
        projectNo: null,
        customerCode: 'CST-0001',
        attempts: 0,
        createdAt: new Date('2026-11-05T01:00:00.000Z'),
      },
    ]);

    await deliverPendingMlNotifications(mockPrisma as never);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      event_id: 'ev-2',
      event_type: 'customer.contacts.updated',
      occurred_at: '2026-11-05T01:00:00.000Z',
      customer_code: 'CST-0001',
    });
  });
});

// ============================================
// HMAC 署名
// ============================================

describe('HMAC署名', () => {
  it('timestamp と本文の両方を署名対象にする（本文だけだとリプレイできる）', () => {
    const a = signMlPayload(WEBHOOK_SECRET, '1762300000', '{"x":1}');
    const b = signMlPayload(WEBHOOK_SECRET, '1762300001', '{"x":1}');
    expect(a).not.toBe(b);
  });

  it('鍵が違えば検証に通らない', () => {
    const sig = signMlPayload(WEBHOOK_SECRET, '1762300000', '{"x":1}');
    expect(verifyMlSignature(WEBHOOK_SECRET, '1762300000', '{"x":1}', sig)).toBe(true);
    expect(verifyMlSignature('other-secret', '1762300000', '{"x":1}', sig)).toBe(false);
  });

  it('送信ヘッダーに署名・timestamp・event_id が入る', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([
      {
        id: 1,
        eventId: 'ev-1',
        eventType: 'project.updated',
        projectNo: 'LIGHT-0077',
        customerCode: null,
        attempts: 0,
        createdAt: new Date('2026-11-05T01:00:00.000Z'),
      },
    ]);

    await deliverPendingMlNotifications(mockPrisma as never);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init.headers['X-M2-Event-Id']).toBe('ev-1');

    const timestamp = init.headers['X-M2-Timestamp'] as string;
    const signature = (init.headers['X-M2-Signature'] as string).replace('sha256=', '');
    expect(verifyMlSignature(WEBHOOK_SECRET, timestamp, init.body as string, signature)).toBe(true);
  });
});

// ============================================
// リトライ
// ============================================

describe('リトライ', () => {
  function pendingEvent(attempts: number) {
    return {
      id: 1,
      eventId: 'ev-1',
      eventType: 'project.updated' as const,
      projectNo: 'LIGHT-0077',
      customerCode: null,
      attempts,
      createdAt: new Date('2026-11-05T01:00:00.000Z'),
    };
  }

  it('失敗したら pending のまま次回時刻を後ろへずらす', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([pendingEvent(0)]);

    const before = Date.now();
    const result = await deliverPendingMlNotifications(mockPrisma as never);

    expect(result).toEqual({ sent: 0, retrying: 1, failed: 0 });
    const data = mockPrisma.integrationOutboxEvent.update.mock.calls[0][0].data as {
      status: string;
      attempts: number;
      nextAttemptAt: Date;
      lastError: string;
    };
    expect(data.status).toBe('pending');
    expect(data.attempts).toBe(1);
    expect(data.lastError).toBe('HTTP 503');
    expect(data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + ML_RETRY_DELAYS_SEC[0] * 1000);
  });

  it('上限まで失敗したら failed にして諦める', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([pendingEvent(ML_MAX_ATTEMPTS - 1)]);

    const result = await deliverPendingMlNotifications(mockPrisma as never);

    expect(result).toEqual({ sent: 0, retrying: 0, failed: 1 });
    const data = mockPrisma.integrationOutboxEvent.update.mock.calls[0][0].data as { status: string };
    expect(data.status).toBe('failed');
  });

  it('失敗理由に個人の情報を含めない（例外のメッセージは載せない）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connect to 山田太郎 test@example.com failed')),
    );
    mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([pendingEvent(0)]);

    await deliverPendingMlNotifications(mockPrisma as never);
    const data = mockPrisma.integrationOutboxEvent.update.mock.calls[0][0].data as {
      lastError: string;
    };
    expect(data.lastError).toBe('Error');
    expect(data.lastError).not.toContain('山田太郎');
  });

  it('期限が来ていない行は拾わない（where に nextAttemptAt の条件が入る）', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await deliverPendingMlNotifications(mockPrisma as never);
    const where = mockPrisma.integrationOutboxEvent.findMany.mock.calls[0][0].where as {
      status: string;
      nextAttemptAt: { lte: Date };
    };
    expect(where.status).toBe('pending');
    expect(where.nextAttemptAt.lte).toBeInstanceOf(Date);
  });

  it('env 未設定なら送信処理そのものを行わない', async () => {
    delete process.env.ML_WEBHOOK_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await deliverPendingMlNotifications(mockPrisma as never);
    expect(result).toEqual({ sent: 0, retrying: 0, failed: 0 });
    expect(mockPrisma.integrationOutboxEvent.findMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('控えの作成に失敗しても例外を投げない（更新自体は成立させる）', async () => {
    mockPrisma.integrationOutboxEvent.create.mockRejectedValue(new Error('db down'));
    await expect(
      enqueueMlNotification(mockPrisma as never, SCREEN_ACTOR, {
        eventType: 'project.updated',
        projectNo: 'LIGHT-0077',
      }),
    ).resolves.toBe(false);
  });
});

// ============================================
// 変更履歴
// ============================================

describe('変更履歴（ML由来の変更）', () => {
  it('ML からの変更は "ML：<名前>" で残す', async () => {
    await recordIntegrationChange(mockPrisma as never, ML_ACTOR, {
      entityType: 'project',
      entityId: 123,
      entityKey: 'LIGHT-0077',
      action: 'update',
      changedFields: ['status_code', 'unit_count'],
    });
    expect(mockPrisma.integrationChangeLog.create.mock.calls[0][0].data).toMatchObject({
      entityType: 'project',
      entityId: 123,
      entityKey: 'LIGHT-0077',
      action: 'update',
      actorLabel: 'ML：山田太郎',
      changedFields: ['status_code', 'unit_count'],
    });
  });

  it('画面からの更新は履歴に残さない（updated_by に残るため二重に持たない）', async () => {
    await recordIntegrationChange(mockPrisma as never, SCREEN_ACTOR, {
      entityType: 'project',
      entityId: 123,
      action: 'update',
      changedFields: ['projectNotes'],
    });
    expect(mockPrisma.integrationChangeLog.create).not.toHaveBeenCalled();
  });

  it('履歴には項目名だけを残し、値は残さない', () => {
    const fields = changedFieldNames(
      {
        contactName: '山田太郎',
        contactEmail: 'test@example.com',
        version: 3,
        businessId: 5,
      },
      { expand: [] },
    );
    expect(fields).toEqual(['contactEmail', 'contactName']);
    expect(JSON.stringify(fields)).not.toContain('山田太郎');
  });
});

// ============================================
// ML 利用者名のヘッダー
// ============================================

describe('X-ML-User ヘッダー', () => {
  it('名前が無ければ 422 相当のエラーを返す（誰が直したか分からない変更を残さない）', () => {
    const request = new NextRequest('https://manage.example.test/x');
    const result = mlActorFromRequest(request);
    expect(result.ok).toBe(false);
  });

  it('壊れたパーセントエンコードは弾く（文字化けした名前を履歴に残さない）', () => {
    const request = new NextRequest('https://manage.example.test/x', {
      headers: { 'x-ml-user': '%E5%B1' },
    });
    expect(mlActorFromRequest(request).ok).toBe(false);
  });

  it('ASCII の名前はそのままでも通る', () => {
    const request = new NextRequest('https://manage.example.test/x', {
      headers: { 'x-ml-user': 'ml-batch' },
    });
    const result = mlActorFromRequest(request);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.actor.actorLabel).toBe('ML：ml-batch');
  });

  it('パーセントエンコードされた日本語の名前は "ML：<名前>" になる', () => {
    const request = new NextRequest('https://manage.example.test/x', {
      headers: { 'x-ml-user': encodeURIComponent('鈴木花子') },
    });
    const result = mlActorFromRequest(request);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.actor.actorLabel).toBe('ML：鈴木花子');
  });

  it('長すぎる名前は弾く（変更履歴のカラム長を超えさせない）', () => {
    const request = new NextRequest('https://manage.example.test/x', {
      headers: { 'x-ml-user': encodeURIComponent('あ'.repeat(200)) },
    });
    expect(mlActorFromRequest(request).ok).toBe(false);
  });
});
