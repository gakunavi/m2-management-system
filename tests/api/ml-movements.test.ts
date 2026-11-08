import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// 案件ムーブメント（段階）の ML連携 読み書き
//
// ML の業務ムーブメント「MO受注」とライト事業の段階は同じもの（2026-11-08 石井さん）。
// 画面と ML のどちらで直しても同じ値になることを、共通の更新処理
// （src/lib/project-movement-update.ts）と2つの口の両方で固定する。
// ============================================================================

const { mockPrisma } = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    mockPrisma: {
      business: model(),
      project: model(),
      projectMovement: model(),
      integrationIdempotencyKey: model(),
      integrationChangeLog: model(),
      integrationOutboxEvent: model(),
      $transaction: vi.fn(),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { GET as MOVEMENTS_GET } from '@/app/api/integrations/projects/[projectNo]/movements/route';
import { PATCH as MOVEMENT_PATCH } from '@/app/api/integrations/projects/[projectNo]/movements/[stepCode]/route';
import { applyMovementUpdate } from '@/lib/project-movement-update';
import { ML_MOVEMENT_ITEM_KEYS } from '@/lib/ml-movement-fields';
import { MOVEMENT_STATUSES, MOVEMENT_STATUS_LABELS } from '@/lib/validations/movement';
import { userActor, mlActorFromRequest } from '@/lib/update-actor';

const READ_TOKEN = 'readonly-token-xyz';
const WRITE_TOKEN = 'write-token-abc';
const BASE = 'https://manage.example.test';
const LIGHT_BUSINESS = { id: 5, businessCode: 'LIGHT' };
const PROJECT_ID = 123;
const UPDATED_AT = new Date('2026-11-08T01:00:00.000Z');

/** ライト事業の段階（本番の名前に合わせた代表例） */
const TEMPLATES = [
  { stepNumber: 1, stepCode: 'industry_assoc_cert', stepName: '工業会証明書発行' },
  { stepNumber: 2, stepCode: 'sme_agency_approval', stepName: '中企庁認定' },
  { stepNumber: 3, stepCode: 'application_form', stepName: '申込書取得' },
];

function movementRow(over: Record<string, unknown> = {}) {
  return {
    movementStatus: 'pending',
    movementStartedAt: null,
    movementCompletedAt: null,
    updatedAt: UPDATED_AT,
    template: TEMPLATES[0],
    ...over,
  };
}

function request(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    mlUser?: string | null;
    body?: unknown;
    idempotencyKey?: string;
  } = {},
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

const movementsParams = (projectNo = 'LIGHT-0077') => ({ params: Promise.resolve({ projectNo }) });
const stepParams = (stepCode: string, projectNo = 'LIGHT-0077') => ({
  params: Promise.resolve({ projectNo, stepCode }),
});

/** ライト事業・案件が見つかる状態にする */
function stubLightScope(businessId = LIGHT_BUSINESS.id) {
  mockPrisma.business.findFirst.mockResolvedValue({ ...LIGHT_BUSINESS, id: businessId });
  mockPrisma.project.findFirst.mockResolvedValue({
    id: PROJECT_ID,
    projectNo: 'LIGHT-0077',
    customer: { id: 11, customerCode: 'CST-0001' },
  });
}

/** 段階1件が見つかり、更新できる状態にする */
function stubMovement(existing: Record<string, unknown> = {}, updated: Record<string, unknown> = {}) {
  mockPrisma.projectMovement.findFirst.mockResolvedValue({
    id: 901,
    projectId: PROJECT_ID,
    movementStatus: 'pending',
    movementStartedAt: null,
    movementCompletedAt: null,
    movementNotes: null,
    updatedAt: UPDATED_AT,
    project: { id: PROJECT_ID, projectNo: 'LIGHT-0077', businessId: LIGHT_BUSINESS.id },
    template: { stepLinkedFieldKey: null, stepName: '工業会証明書発行' },
    ...existing,
  });
  mockPrisma.projectMovement.update.mockResolvedValue({
    id: 901,
    projectId: PROJECT_ID,
    templateId: 77,
    movementStatus: 'completed',
    movementStartedAt: new Date('2026-11-01T00:00:00.000Z'),
    movementCompletedAt: new Date('2026-11-05T00:00:00.000Z'),
    movementNotes: null,
    updatedAt: new Date('2026-11-08T02:00:00.000Z'),
    updatedBy: null,
    template: { id: 77, ...TEMPLATES[0], stepDescription: null, stepLinkedFieldKey: null },
    ...updated,
  });
}

function mlActor() {
  const result = mlActorFromRequest(
    new NextRequest(`${BASE}/api/integrations/projects/LIGHT-0077/movements/x`, {
      method: 'PATCH',
      headers: { 'x-ml-user': encodeURIComponent('山田太郎') },
    }),
  );
  if (!result.ok) throw new Error('actor');
  return result.actor;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTEGRATION_API_TOKEN = WRITE_TOKEN;
  process.env.INTEGRATION_READONLY_TOKEN = READ_TOKEN;
  process.env.INTEGRATION_BUSINESS_CODE = 'LIGHT';
  process.env.NEXTAUTH_URL = BASE;
  delete process.env.INTEGRATION_IP_ALLOWLIST;
  // 通知は既定で無効（env 未設定＝no-op）。通知のテストだけ env を立てる
  delete process.env.ML_WEBHOOK_URL;
  delete process.env.ML_WEBHOOK_SECRET;

  mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue(null);
  mockPrisma.integrationIdempotencyKey.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.integrationIdempotencyKey.upsert.mockResolvedValue({});
  mockPrisma.integrationChangeLog.create.mockResolvedValue({ id: 1 });
  mockPrisma.integrationOutboxEvent.create.mockResolvedValue({ id: 1 });
  mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(
    (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
  );
});

afterEach(() => {
  delete process.env.INTEGRATION_API_TOKEN;
  delete process.env.INTEGRATION_READONLY_TOKEN;
});

// ============================================================================
// 1. 認証（トークンの種別）
// ============================================================================

describe('認証', () => {
  it('段階の読み出しは読み取り用トークンで通る', async () => {
    stubLightScope();
    mockPrisma.projectMovement.findMany.mockResolvedValue([movementRow()]);

    const res = await MOVEMENTS_GET(
      request('/api/integrations/projects/LIGHT-0077/movements', { token: READ_TOKEN }),
      movementsParams(),
    );
    expect(res.status).toBe(200);
  });

  it('段階の読み出しは書き込み用トークンでは 401', async () => {
    stubLightScope();
    const res = await MOVEMENTS_GET(
      request('/api/integrations/projects/LIGHT-0077/movements', { token: WRITE_TOKEN }),
      movementsParams(),
    );
    expect(res.status).toBe(401);
  });

  it('段階の書き込みは読み取り用トークンでは 401', async () => {
    stubLightScope();
    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        token: READ_TOKEN,
        body: { status: 'completed', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );
    expect(res.status).toBe(401);
  });

  it('X-ML-User が無い書き込みは 422', async () => {
    stubLightScope();
    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        mlUser: null,
        body: { status: 'completed', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );
    expect(res.status).toBe(422);
  });
});

// ============================================================================
// 2. 読み出し
// ============================================================================

describe('GET /api/integrations/projects/{project_no}/movements', () => {
  it('段階ごとに step_code・状態・開始日・完了日・楽観ロック用の値を返す', async () => {
    stubLightScope();
    mockPrisma.projectMovement.findMany.mockResolvedValue([
      movementRow({
        movementStatus: 'completed',
        movementStartedAt: new Date('2026-11-01T00:00:00.000Z'),
        movementCompletedAt: new Date('2026-11-05T00:00:00.000Z'),
      }),
      movementRow({ template: TEMPLATES[1], movementStatus: 'started' }),
      movementRow({ template: TEMPLATES[2] }),
    ]);

    const res = await MOVEMENTS_GET(
      request('/api/integrations/projects/LIGHT-0077/movements', { token: READ_TOKEN }),
      movementsParams(),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.project_no).toBe('LIGHT-0077');
    expect(json.meta.count).toBe(3);
    expect(json.items).toHaveLength(3);

    // キーは落とさない（ML が列を固定で埋める）
    expect(Object.keys(json.items[0]).sort()).toEqual([...ML_MOVEMENT_ITEM_KEYS].sort());

    expect(json.items[0]).toMatchObject({
      step_code: 'industry_assoc_cert',
      step_name: '工業会証明書発行',
      step_number: 1,
      status: 'completed',
      status_label: '完了',
      started_at: '2026-11-01',
      completed_at: '2026-11-05',
      updated_at: UPDATED_AT.toISOString(),
    });
    // 未着手は日付が null
    expect(json.items[2]).toMatchObject({ status: 'pending', started_at: null, completed_at: null });
  });

  it('並びは事業マスタのムーブメント定義の順（step_number 昇順）', async () => {
    stubLightScope();
    mockPrisma.projectMovement.findMany.mockResolvedValue([movementRow()]);

    await MOVEMENTS_GET(
      request('/api/integrations/projects/LIGHT-0077/movements', { token: READ_TOKEN }),
      movementsParams(),
    );

    const args = mockPrisma.projectMovement.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ template: { stepNumber: 'asc' } });
    expect(args.where).toEqual({ projectId: PROJECT_ID });
  });

  it('選べる状態の一覧を meta に添える（ML が選択肢を持たなくて済む）', async () => {
    stubLightScope();
    mockPrisma.projectMovement.findMany.mockResolvedValue([]);

    const res = await MOVEMENTS_GET(
      request('/api/integrations/projects/LIGHT-0077/movements', { token: READ_TOKEN }),
      movementsParams(),
    );
    const json = await res.json();

    expect(json.meta.status_options).toEqual(
      MOVEMENT_STATUSES.map((code) => ({ code, label: MOVEMENT_STATUS_LABELS[code] })),
    );
    // 営業管理システムの5つ（未着手・進行中・完了・スキップ・不要）をそのまま返す
    expect(json.meta.status_options.map((o: { label: string }) => o.label)).toEqual([
      '未着手', '進行中', '完了', 'スキップ', '不要',
    ]);
  });

  it('ライト事業以外の案件は 404', async () => {
    mockPrisma.business.findFirst.mockResolvedValue(LIGHT_BUSINESS);
    mockPrisma.project.findFirst.mockResolvedValue(null);

    const res = await MOVEMENTS_GET(
      request('/api/integrations/projects/MOAG-0001/movements', { token: READ_TOKEN }),
      movementsParams('MOAG-0001'),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.projectMovement.findMany).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 3. 書き込み
// ============================================================================

describe('PATCH /api/integrations/projects/{project_no}/movements/{step_code}', () => {
  it('状態・開始日・完了日を直せる', async () => {
    stubLightScope();
    stubMovement();

    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: {
          status: 'completed',
          started_at: '2026-11-01',
          completed_at: '2026-11-05',
          updated_at: UPDATED_AT.toISOString(),
        },
      }),
      stepParams('industry_assoc_cert'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    const data = mockPrisma.projectMovement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.movementStatus).toBe('completed');
    expect((data.movementStartedAt as Date).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect((data.movementCompletedAt as Date).toISOString()).toBe('2026-11-05T00:00:00.000Z');
    // ML は m2 のユーザーではないので updated_by には入れない（履歴に名前が残る）
    expect(data.updatedBy).toBeNull();

    // レスポンスは読み出しと同じ形（行全体を置き換えても欄が消えない）
    expect(Object.keys(json).sort()).toEqual([...ML_MOVEMENT_ITEM_KEYS].sort());
    expect(json.started_at).toBe('2026-11-01');
  });

  it('日付を送らずに状態だけ変えると、画面と同じ規則で日付が入る', async () => {
    stubLightScope();
    stubMovement();

    await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'completed', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );

    const data = mockPrisma.projectMovement.update.mock.calls[0][0].data as Record<string, unknown>;
    // 開始日が空なら今・完了日に今
    expect(data.movementStartedAt).toBeInstanceOf(Date);
    expect(data.movementCompletedAt).toBeInstanceOf(Date);
  });

  it('スキップは完了日を入れない（画面の編集モーダルと同じ）', async () => {
    stubLightScope();
    stubMovement({
      movementStatus: 'started',
      movementStartedAt: new Date('2026-11-01T00:00:00.000Z'),
    });

    await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'skipped', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );

    const data = mockPrisma.projectMovement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.movementStatus).toBe('skipped');
    expect(data.movementCompletedAt).toBeNull();
    // 開始日はそのまま（触らない）
    expect('movementStartedAt' in data).toBe(false);
  });

  it('未着手に戻すと日付が消える', async () => {
    stubLightScope();
    stubMovement({
      movementStatus: 'completed',
      movementStartedAt: new Date('2026-11-01T00:00:00.000Z'),
      movementCompletedAt: new Date('2026-11-05T00:00:00.000Z'),
    });

    await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'pending', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );

    const data = mockPrisma.projectMovement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.movementStartedAt).toBeNull();
    expect(data.movementCompletedAt).toBeNull();
  });

  it('日付だけ null で空にできる', async () => {
    stubLightScope();
    stubMovement({ movementCompletedAt: new Date('2026-11-05T00:00:00.000Z') });

    await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { completed_at: null, updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );

    const data = mockPrisma.projectMovement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.movementCompletedAt).toBeNull();
    expect('movementStatus' in data).toBe(false);
  });

  it('先に更新されていたら 409 で現在値を返す', async () => {
    stubLightScope();
    stubMovement({ updatedAt: new Date('2026-11-08T03:00:00.000Z') });
    mockPrisma.projectMovement.findFirst
      .mockResolvedValueOnce({
        id: 901,
        projectId: PROJECT_ID,
        movementStatus: 'started',
        movementStartedAt: new Date('2026-11-01T00:00:00.000Z'),
        movementCompletedAt: null,
        updatedAt: new Date('2026-11-08T03:00:00.000Z'),
        project: { id: PROJECT_ID, projectNo: 'LIGHT-0077', businessId: LIGHT_BUSINESS.id },
        template: { stepLinkedFieldKey: null, stepName: '工業会証明書発行' },
      })
      // onConflict が読む現在値
      .mockResolvedValueOnce(
        movementRow({
          movementStatus: 'started',
          movementStartedAt: new Date('2026-11-01T00:00:00.000Z'),
          updatedAt: new Date('2026-11-08T03:00:00.000Z'),
        }),
      );

    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'completed', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.current.status).toBe('started');
    expect(json.current.updated_at).toBe('2026-11-08T03:00:00.000Z');
    expect(mockPrisma.projectMovement.update).not.toHaveBeenCalled();
  });

  it('知らない step_code は 404', async () => {
    stubLightScope();
    mockPrisma.projectMovement.findFirst.mockResolvedValue(null);

    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/unknown_step', {
        method: 'PATCH',
        body: { status: 'completed', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('unknown_step'),
    );
    expect(res.status).toBe(404);
  });

  it('ライト事業以外の案件は 404（段階を読みにも行かない）', async () => {
    mockPrisma.business.findFirst.mockResolvedValue(LIGHT_BUSINESS);
    mockPrisma.project.findFirst.mockResolvedValue(null);

    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/MOAG-0001/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'completed', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert', 'MOAG-0001'),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.projectMovement.findFirst).not.toHaveBeenCalled();
  });

  it('知らないキーは 422', async () => {
    stubLightScope();
    stubMovement();

    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'completed', notes: 'メモ', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.errors.length).toBeGreaterThan(0);
    expect(mockPrisma.projectMovement.update).not.toHaveBeenCalled();
  });

  it('知らない状態の値は 422', async () => {
    stubLightScope();
    stubMovement();

    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'done', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.errors[0].field).toBe('status');
  });

  it('日付の形式違いは 422', async () => {
    stubLightScope();
    stubMovement();

    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { completed_at: '2026/11/05', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.errors[0].field).toBe('completed_at');
  });

  it('楽観ロックの値が無いリクエストは 422', async () => {
    stubLightScope();
    stubMovement();

    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'completed' },
      }),
      stepParams('industry_assoc_cert'),
    );
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.errors[0].field).toBe('updated_at');
  });

  it('同じ Idempotency-Key と同じ内容の再送は1回だけ反映する', async () => {
    stubLightScope();
    stubMovement();

    const send = () =>
      MOVEMENT_PATCH(
        request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
          method: 'PATCH',
          idempotencyKey: 'ml-20261108-0001',
          body: { status: 'completed', updated_at: UPDATED_AT.toISOString() },
        }),
        stepParams('industry_assoc_cert'),
      );

    await send();
    const saved = mockPrisma.integrationIdempotencyKey.upsert.mock.calls[0][0];
    mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue({
      requestHash: saved.create.requestHash,
      statusCode: saved.create.statusCode,
      responseBody: saved.create.responseBody,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const res2 = await send();
    expect(res2.status).toBe(200);
    expect(res2.headers.get('Idempotent-Replay')).toBe('true');
    expect(mockPrisma.projectMovement.update).toHaveBeenCalledTimes(1);
  });

  it('変更履歴には項目名だけ残す（値は残さない）', async () => {
    stubLightScope();
    stubMovement();

    await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: { status: 'completed', completed_at: '2026-11-05', updated_at: UPDATED_AT.toISOString() },
      }),
      stepParams('industry_assoc_cert'),
    );

    const log = mockPrisma.integrationChangeLog.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(log.entityType).toBe('movement');
    expect(log.entityKey).toBe('LIGHT-0077:industry_assoc_cert');
    expect(log.actorLabel).toBe('ML：山田太郎');
    expect(log.changedFields).toEqual(['completed_at', 'status']);
    // 値（日付・状態）は残らない
    expect(JSON.stringify(log.changedFields)).not.toContain('2026-11-05');
    expect(JSON.stringify(log.changedFields)).not.toContain('completed"');
  });
});

// ============================================================================
// 4. 通知（共通の更新処理の側で固定する）
// ============================================================================

describe('段階を直したときの ML への知らせ', () => {
  const ADMIN = userActor({ id: 1, role: 'admin', userName: '石井' });

  /** 対象事業（ライト）は id=5 のまま。案件の事業だけ差し替える */
  function stubCore(projectBusinessId = LIGHT_BUSINESS.id) {
    stubLightScope();
    stubMovement({
      project: { id: PROJECT_ID, projectNo: 'LIGHT-0077', businessId: projectBusinessId },
    });
  }

  it('画面から直すと project.movements.updated を知らせる', async () => {
    process.env.ML_WEBHOOK_URL = 'https://ml.example.test/webhooks/m2';
    process.env.ML_WEBHOOK_SECRET = 'shhh';
    stubCore();

    await applyMovementUpdate(mockPrisma as never, {
      projectId: PROJECT_ID,
      target: { kind: 'id', movementId: 901 },
      fields: { movementStatus: 'completed' },
      actor: ADMIN,
    });

    const event = mockPrisma.integrationOutboxEvent.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(event.eventType).toBe('project.movements.updated');
    expect(event.projectNo).toBe('LIGHT-0077');
    // 本文に値（状態・日付）は入れない
    expect(event.customerCode ?? null).toBeNull();
    expect(JSON.stringify(event)).not.toContain('completed');
  });

  it('ML から直したものは知らせ返さない（ループ防止）', async () => {
    process.env.ML_WEBHOOK_URL = 'https://ml.example.test/webhooks/m2';
    process.env.ML_WEBHOOK_SECRET = 'shhh';
    stubCore();

    await applyMovementUpdate(mockPrisma as never, {
      projectId: PROJECT_ID,
      target: { kind: 'stepCode', stepCode: 'industry_assoc_cert' },
      fields: { movementStatus: 'completed' },
      actor: mlActor(),
      expectedUpdatedAt: UPDATED_AT.toISOString(),
    });

    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('ライト事業以外の案件では知らせない', async () => {
    process.env.ML_WEBHOOK_URL = 'https://ml.example.test/webhooks/m2';
    process.env.ML_WEBHOOK_SECRET = 'shhh';
    stubCore(99);

    await applyMovementUpdate(mockPrisma as never, {
      projectId: PROJECT_ID,
      target: { kind: 'id', movementId: 901 },
      fields: { movementStatus: 'completed' },
      actor: ADMIN,
    });

    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('通知先が未設定なら控えも作らない', async () => {
    stubCore();

    await applyMovementUpdate(mockPrisma as never, {
      projectId: PROJECT_ID,
      target: { kind: 'id', movementId: 901 },
      fields: { movementStatus: 'completed' },
      actor: ADMIN,
    });

    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 5. 画面と ML で同じ値になること（共通の更新処理を通る）
// ============================================================================

describe('画面と ML の経路', () => {
  it('画面は id・ML は step_code で同じ行を引く', async () => {
    stubLightScope();
    stubMovement();

    await applyMovementUpdate(mockPrisma as never, {
      projectId: PROJECT_ID,
      target: { kind: 'id', movementId: 901 },
      fields: { movementStatus: 'started' },
      actor: userActor({ id: 1, role: 'admin', userName: '石井' }),
    });
    expect(mockPrisma.projectMovement.findFirst.mock.calls[0][0].where).toEqual({
      id: 901,
      projectId: PROJECT_ID,
    });

    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
    );
    stubLightScope();
    stubMovement();

    await applyMovementUpdate(mockPrisma as never, {
      projectId: PROJECT_ID,
      target: { kind: 'stepCode', stepCode: 'industry_assoc_cert' },
      fields: { movementStatus: 'started' },
      actor: mlActor(),
      expectedUpdatedAt: UPDATED_AT.toISOString(),
    });
    expect(mockPrisma.projectMovement.findFirst.mock.calls[0][0].where).toEqual({
      projectId: PROJECT_ID,
      template: { stepCode: 'industry_assoc_cert' },
    });
  });

  it('画面からの更新は updated_by に m2 のユーザーIDが入る', async () => {
    stubLightScope();
    stubMovement();

    await applyMovementUpdate(mockPrisma as never, {
      projectId: PROJECT_ID,
      target: { kind: 'id', movementId: 901 },
      fields: { movementStatus: 'completed' },
      actor: userActor({ id: 42, role: 'staff', userName: '石井' }),
    });

    const data = mockPrisma.projectMovement.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.updatedBy).toBe(42);
  });

  it('連動フィールドは画面からだけ（ML の口は受け付けない）', async () => {
    stubLightScope();
    stubMovement({ template: { stepLinkedFieldKey: 'needs', stepName: '工業会証明書発行' } });
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue({ projectCustomData: { needs: '未定' } });
    mockPrisma.project.update.mockResolvedValue({ id: PROJECT_ID });

    await applyMovementUpdate(mockPrisma as never, {
      projectId: PROJECT_ID,
      target: { kind: 'id', movementId: 901 },
      fields: { movementStatus: 'completed', linkedFieldUpdate: { key: 'needs', value: 'A_節税' } },
      actor: userActor({ id: 1, role: 'admin', userName: '石井' }),
    });

    const projectData = mockPrisma.project.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(projectData.projectCustomData).toEqual({ needs: 'A_節税' });

    // ML のスキーマには連動フィールドのキーが無い（送ると 422）
    const res = await MOVEMENT_PATCH(
      request('/api/integrations/projects/LIGHT-0077/movements/industry_assoc_cert', {
        method: 'PATCH',
        body: {
          status: 'completed',
          linkedFieldUpdate: { key: 'needs', value: 'A_節税' },
          updated_at: UPDATED_AT.toISOString(),
        },
      }),
      stepParams('industry_assoc_cert'),
    );
    expect(res.status).toBe(422);
  });
});
