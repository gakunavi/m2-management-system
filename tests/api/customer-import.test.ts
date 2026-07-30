import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// モック定義（vi.hoisted でホイスティング対応）
// ============================================

const { mockPrisma } = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    mockPrisma: {
      customer: model(),
      industry: model(),
      business: model(),
      customerContact: model(),
      customerContactBusinessLink: model(),
      customerBankAccount: model(),
      customerBusinessLink: model(),
      integrationIdempotencyKey: model(),
      $transaction: vi.fn(),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// vi.mock はホイストされるため、静的 import で問題ない
import { POST } from '@/app/api/integrations/customers/import/route';

// ============================================
// 共通データ
// ============================================

const TOKEN = 'test-integration-token';
const URL = 'https://manage.example.test/api/integrations/customers/import';

/** フォームから送られてくる想定のボディ（mo_no が特定キー） */
const BODY = {
  mo_no: 'MO-79',
  form_submitted_at: '2026-07-29T10:23:00+09:00',
  customer_type: '法人',
  company_name: '株式会社テスト商事',
  postal_code: '108-0075', // 既存が空欄 → fill
  address: '東京都港区港南2-2-14', // 既存と同じ → 変更なし
  phone: '03-1234-5678', // 既存と食い違う → conflict
  representative_name: '山田 太郎', // 既存と同じ
  established_on: '2015-04-01',
  corporate_no: '1234567890123',
  invoice_no: 'T1234567890123', // 既存が空欄 → fill
  fiscal_month: 3,
  industry: '建設業',
  company_email: 'info@example.test', // 既存が空欄 → fill
  bank_name: 'GMOあおぞらネット銀行',
  branch_name: '法人第二営業部',
  account_type: '普通',
  account_no: '1234567',
  account_holder: 'カ）テストシヨウジ',
  contacts: [
    { role: 'main', name: '佐藤 花子', department: '総務部', email: 'sato@example.test' },
    { role: 'cc', name: '鈴木 一郎', department: null, email: 'suzuki@example.test' },
  ],
  gbiz_id_prime: '取得済み',
  kyoka_zeisei_history: 'なし',
  gratitude_addressee: '株式会社テスト商事 御中',
  delivery_address: '〒108-0075 東京都港区港南2-2-14',
};

const EXISTING_CUSTOMER = {
  id: 501,
  customerName: '株式会社テスト商事',
  customerType: '法人',
  customerPostalCode: null, // 空欄
  customerAddress: '東京都港区港南2-2-14',
  customerPhone: '03-0000-0000', // 食い違い
  customerEmail: null, // 空欄
  customerCorporateNumber: '1234567890123',
  customerInvoiceNumber: null, // 空欄
  customerFiscalMonth: 3,
  customerEstablishedDate: new Date('2015-04-01T00:00:00.000Z'),
  industryId: 7,
  industry: { industryName: '建設業' },
  contacts: [
    {
      id: 111,
      contactName: '山田 太郎',
      contactDepartment: null,
      contactEmail: null,
      contactIsRepresentative: true,
      contactIsPrimary: false,
    },
  ],
  bankAccounts: [] as Array<Record<string, unknown>>,
};

function buildRequest(
  body: unknown,
  options: { token?: string | null; idempotencyKey?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-proto': 'https',
  };
  const token = options.token === undefined ? TOKEN : options.token;
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  return new NextRequest(URL, { method: 'POST', headers, body: JSON.stringify(body) });
}

/** mo_no がヒットする（＝既存顧客の更新）状態 */
function setupExisting(overrides: { linkData?: Record<string, unknown> } = {}) {
  mockPrisma.customerBusinessLink.findFirst.mockResolvedValue({
    id: 3,
    customerId: 501,
    linkCustomData: overrides.linkData ?? { mo_no: 'MO-79' },
  });
  mockPrisma.customer.findUnique.mockResolvedValue(EXISTING_CUSTOMER);
  mockPrisma.customer.update.mockResolvedValue({ id: 501 });
  mockPrisma.industry.findFirst.mockResolvedValue({ id: 7, industryName: '建設業' });
  mockPrisma.customerContact.create.mockResolvedValue({ id: 222 });
  mockPrisma.customerContact.update.mockResolvedValue({ id: 111 });
  mockPrisma.customerContact.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.customerContactBusinessLink.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.customerBankAccount.create.mockResolvedValue({ id: 9 });
  mockPrisma.customerBankAccount.update.mockResolvedValue({ id: 9 });
  mockPrisma.customerBusinessLink.update.mockResolvedValue({ id: 3 });
}

/** mo_no がヒットしない状態 */
function setupNotFound() {
  mockPrisma.customerBusinessLink.findFirst.mockResolvedValue(null);
  mockPrisma.industry.findFirst.mockResolvedValue({ id: 7, industryName: '建設業' });
  mockPrisma.customer.findFirst.mockImplementation(async (args: Record<string, never>) => {
    const where = (args as { where?: Record<string, unknown> }).where ?? {};
    if ((where.customerCode as { startsWith?: string } | undefined)?.startsWith === 'CST-') {
      return { customerCode: 'CST-0173' };
    }
    return null;
  });
  mockPrisma.customer.create.mockResolvedValue({ id: 601 });
  mockPrisma.customerContact.create.mockResolvedValue({ id: 301 });
  mockPrisma.customerContact.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.customerContactBusinessLink.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.customerBankAccount.create.mockResolvedValue({ id: 11 });
  mockPrisma.customerBusinessLink.create.mockResolvedValue({ id: 12 });
}

/** DBへの書き込みが1件も発生していないこと */
function expectNoWrites() {
  expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  expect(mockPrisma.customerContact.create).not.toHaveBeenCalled();
  expect(mockPrisma.customerContact.update).not.toHaveBeenCalled();
  expect(mockPrisma.customerContact.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.customerBankAccount.create).not.toHaveBeenCalled();
  expect(mockPrisma.customerBankAccount.update).not.toHaveBeenCalled();
  expect(mockPrisma.customerBusinessLink.create).not.toHaveBeenCalled();
  expect(mockPrisma.customerBusinessLink.update).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTEGRATION_API_TOKEN = TOKEN;
  process.env.INTEGRATION_BUSINESS_CODE = 'LIGHT';
  process.env.NEXTAUTH_URL = 'https://manage.example.test';
  delete process.env.INTEGRATION_IP_ALLOWLIST;

  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockPrisma),
  );
  mockPrisma.business.findFirst.mockResolvedValue({ id: 5, businessCode: 'LIGHT' });
  mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue(null);
  mockPrisma.integrationIdempotencyKey.upsert.mockResolvedValue({ id: 1 });
  mockPrisma.integrationIdempotencyKey.deleteMany.mockResolvedValue({ count: 0 });
});

// ============================================
// 検証手順 1: 実在しない mo_no
// ============================================

describe('mo_no が見つからない場合', () => {
  it('既定（更新のみ）では 404 を返し、DBを変更しない', async () => {
    setupNotFound();

    const response = await POST(buildRequest({ ...BODY, mo_no: 'MO-9999', dry_run: true }));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.mo_no).toBe('MO-9999');
    expect(json.error).toContain('allow_create');
    expectNoWrites();
  });

  it('dry_run なしでも 404（勝手に作らない）', async () => {
    setupNotFound();

    const response = await POST(buildRequest({ ...BODY, mo_no: 'MO-9999' }));

    expect(response.status).toBe(404);
    expectNoWrites();
  });
});

// ============================================
// 検証手順 2: 既存顧客に対する dry_run
// ============================================

describe('dry_run', () => {
  it('DBを一切変更せず、filled_fields と conflicts を返す', async () => {
    setupExisting();

    const response = await POST(buildRequest({ ...BODY, dry_run: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.dry_run).toBe(true);
    expect(json.created).toBe(false);
    expect(json.id).toBe(501);

    // 既存が空欄だった項目は「埋める予定」として返る
    expect(json.filled_fields).toContain('postal_code');
    expect(json.filled_fields).toContain('company_email');
    expect(json.filled_fields).toContain('invoice_no');
    expect(json.filled_fields).toContain('gratitude_addressee');

    // 食い違いは conflicts に既存値・送信値の両方を入れて返す
    expect(json.conflicts).toEqual([
      { field: 'phone', existing: '03-0000-0000', incoming: '03-1234-5678' },
    ]);

    // overwrite_fields が無いので上書きは発生しない
    expect(json.updated_fields).toEqual([]);

    expectNoWrites();
  });

  it('冪等キーを消費しない（記録も参照もしない）', async () => {
    setupExisting();

    await POST(buildRequest({ ...BODY, dry_run: true }, { idempotencyKey: 'key-dry' }));

    expect(mockPrisma.integrationIdempotencyKey.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.integrationIdempotencyKey.upsert).not.toHaveBeenCalled();
  });

  it('同じ内容の dry_run は何度でも同じ結果を返す', async () => {
    setupExisting();
    const first = await (await POST(buildRequest({ ...BODY, dry_run: true }))).json();

    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma));
    mockPrisma.business.findFirst.mockResolvedValue({ id: 5, businessCode: 'LIGHT' });
    setupExisting();
    const second = await (await POST(buildRequest({ ...BODY, dry_run: true }))).json();

    expect(second).toEqual(first);
  });
});

// ============================================
// 検証手順 3: 本実行（空欄だけ埋める）
// ============================================

describe('本実行（overwrite_fields なし）', () => {
  it('空欄だけを埋め、食い違いは据え置く', async () => {
    setupExisting();

    const response = await POST(buildRequest(BODY));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.dry_run).toBe(false);
    expect(json.filled_fields).toContain('postal_code');
    expect(json.conflicts).toEqual([
      { field: 'phone', existing: '03-0000-0000', incoming: '03-1234-5678' },
    ]);

    const updateArgs = mockPrisma.customer.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // 空欄だった項目は書き込まれる
    expect(updateArgs.data.customerPostalCode).toBe('108-0075');
    expect(updateArgs.data.customerEmail).toBe('info@example.test');
    expect(updateArgs.data.customerInvoiceNumber).toBe('T1234567890123');
    // 食い違った項目は書き込まれない
    expect(updateArgs.data.customerPhone).toBeUndefined();
    // 同値の項目も書き込まれない
    expect(updateArgs.data.customerName).toBeUndefined();
    expect(updateArgs.data.version).toEqual({ increment: 1 });
  });

  it('mo_no は常に事業別カスタムデータへ保持される', async () => {
    setupExisting();

    await POST(buildRequest(BODY));

    const linkArgs = mockPrisma.customerBusinessLink.update.mock.calls[0][0] as {
      data: { linkCustomData: Record<string, unknown> };
    };
    expect(linkArgs.data.linkCustomData.mo_no).toBe('MO-79');
    expect(linkArgs.data.linkCustomData.gratitude_addressee).toBe('株式会社テスト商事 御中');
    expect(linkArgs.data.linkCustomData.form_submitted_at).toBe('2026-07-29T10:23:00+09:00');
  });

  it('既存の事業別カスタムデータのキーを消さない', async () => {
    setupExisting({ linkData: { mo_no: 'MO-79', gbiz_id_prime: '取得済み', 既存メモ: '残すこと' } });

    await POST(buildRequest(BODY));

    const linkArgs = mockPrisma.customerBusinessLink.update.mock.calls[0][0] as {
      data: { linkCustomData: Record<string, unknown> };
    };
    expect(linkArgs.data.linkCustomData['既存メモ']).toBe('残すこと');
  });

  it('連絡先が無ければ追加し、代表者が同名なら触らない', async () => {
    setupExisting();

    const json = await (await POST(buildRequest(BODY))).json();

    // 佐藤・鈴木は既存に無いので追加される
    expect(json.filled_fields).toContain('contacts[sato@example.test]');
    expect(json.filled_fields).toContain('contacts[suzuki@example.test]');
    expect(mockPrisma.customerContact.create).toHaveBeenCalledTimes(2);
    // 代表者「山田 太郎」は既存と同名なので更新しない
    expect(mockPrisma.customerContact.update).not.toHaveBeenCalled();
  });
});

// ============================================
// 検証手順 4: overwrite_fields
// ============================================

describe('overwrite_fields', () => {
  it('指定した項目だけ上書きし、updated_fields に返す', async () => {
    setupExisting();

    const response = await POST(buildRequest({ ...BODY, overwrite_fields: ['phone'] }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.updated_fields).toEqual(['phone']);
    expect(json.conflicts).toEqual([]);

    const updateArgs = mockPrisma.customer.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data.customerPhone).toBe('03-1234-5678');
  });

  it('指定していない食い違いは上書きしない', async () => {
    setupExisting();
    // 会社名も食い違わせるが、上書き指定は phone だけ
    const response = await POST(
      buildRequest({ ...BODY, company_name: '株式会社別名', overwrite_fields: ['phone'] }),
    );
    const json = await response.json();

    expect(json.updated_fields).toEqual(['phone']);
    expect(json.conflicts).toEqual([
      { field: 'company_name', existing: '株式会社テスト商事', incoming: '株式会社別名' },
    ]);

    const updateArgs = mockPrisma.customer.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data.customerName).toBeUndefined();
  });

  it('dry_run と overwrite_fields を併用しても書き込まない', async () => {
    setupExisting();

    const json = await (
      await POST(buildRequest({ ...BODY, overwrite_fields: ['phone'], dry_run: true }))
    ).json();

    expect(json.updated_fields).toEqual(['phone']);
    expectNoWrites();
  });
});

// ============================================
// 検証手順 5: Idempotency-Key
// ============================================

describe('Idempotency-Key', () => {
  it('同一キーの再送は DB を変更せず前回と同じレスポンスを返す', async () => {
    setupExisting();
    await POST(buildRequest(BODY, { idempotencyKey: 'key-abc' }));
    const saved = mockPrisma.integrationIdempotencyKey.upsert.mock.calls[0][0] as {
      create: { requestHash: string; statusCode: number; responseBody: unknown };
    };

    vi.clearAllMocks();
    mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue({
      requestHash: saved.create.requestHash,
      statusCode: saved.create.statusCode,
      responseBody: saved.create.responseBody,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const response = await POST(buildRequest(BODY, { idempotencyKey: 'key-abc' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(saved.create.responseBody);
    expect(response.headers.get('Idempotent-Replay')).toBe('true');
    expectNoWrites();
  });

  it('同一キーで異なる内容が来たら 409', async () => {
    setupExisting();
    mockPrisma.integrationIdempotencyKey.findUnique.mockResolvedValue({
      requestHash: 'まったく別のハッシュ',
      statusCode: 200,
      responseBody: { id: 501 },
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const response = await POST(buildRequest(BODY, { idempotencyKey: 'key-abc' }));

    expect(response.status).toBe(409);
    expectNoWrites();
  });
});

// ============================================
// allow_create
// ============================================

describe('allow_create', () => {
  it('true かつ mo_no 未ヒットなら 201 で作成し、mo_no を保存する', async () => {
    setupNotFound();

    const response = await POST(buildRequest({ ...BODY, mo_no: 'MO-100', allow_create: true }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.created).toBe(true);
    expect(json.id).toBe(601);
    expect(json.url).toBe('https://manage.example.test/customers/601');
    expect(json.filled_fields).toContain('company_name');

    const createArgs = mockPrisma.customer.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data.customerCode).toBe('CST-0174');
    // 感謝状の宛名は customerSalutation に入れない
    expect(createArgs.data.customerSalutation).toBeNull();

    const linkArgs = mockPrisma.customerBusinessLink.create.mock.calls[0][0] as {
      data: { businessId: number; linkCustomData: Record<string, unknown> };
    };
    expect(linkArgs.data.businessId).toBe(5);
    expect(linkArgs.data.linkCustomData.mo_no).toBe('MO-100');
  });

  it('true + dry_run は DB を変更せず id=null で返す', async () => {
    setupNotFound();

    const response = await POST(
      buildRequest({ ...BODY, mo_no: 'MO-100', allow_create: true, dry_run: true }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.created).toBe(true);
    expect(json.dry_run).toBe(true);
    expect(json.id).toBeNull();
    expect(json.url).toBeNull();
    expectNoWrites();
  });

  it('true のとき必須項目が欠けていれば 422', async () => {
    setupNotFound();

    const response = await POST(
      buildRequest({ mo_no: 'MO-100', allow_create: true, company_name: '株式会社テスト商事' }),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    const fields = (json.errors as Array<{ field: string }>).map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(['address', 'representative_name', 'customer_type']),
    );
  });

  it('個人事業主は corporate_no 無しでも作成できる', async () => {
    setupNotFound();

    const response = await POST(
      buildRequest({
        ...BODY,
        mo_no: 'MO-101',
        allow_create: true,
        customer_type: '個人事業主',
        corporate_no: null,
        invoice_no: null,
      }),
    );

    expect(response.status).toBe(201);
  });

  it('法人で corporate_no が無ければ 422', async () => {
    setupNotFound();

    const response = await POST(
      buildRequest({ ...BODY, mo_no: 'MO-102', allow_create: true, corporate_no: null }),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect((json.errors as Array<{ field: string }>).map((e) => e.field)).toContain('corporate_no');
  });
});

// ============================================
// バリデーション
// ============================================

describe('バリデーション', () => {
  it('mo_no が無ければ 422', async () => {
    setupExisting();

    const { mo_no: _omit, ...withoutMoNo } = BODY;
    const response = await POST(buildRequest(withoutMoNo));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect((json.errors as Array<{ field: string }>).map((e) => e.field)).toContain('mo_no');
    expectNoWrites();
  });

  it('法人番号が13桁でなければ 422', async () => {
    setupExisting();

    const response = await POST(buildRequest({ ...BODY, corporate_no: '123' }));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect((json.errors as Array<{ field: string }>).map((e) => e.field)).toContain('corporate_no');
  });

  it('決算月が範囲外なら 422', async () => {
    setupExisting();

    const response = await POST(buildRequest({ ...BODY, fiscal_month: 13 }));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect((json.errors as Array<{ field: string }>).map((e) => e.field)).toContain('fiscal_month');
  });

  it('業種がマスタに無ければ警告を返し、原文字列を残す', async () => {
    setupExisting();
    mockPrisma.industry.findFirst.mockResolvedValue(null);

    const json = await (await POST(buildRequest(BODY))).json();

    expect(json.warnings).toContain('industry マスタ未一致：建設業');
    expect(json.filled_fields).toContain('industry_raw');
    expect(mockPrisma.industry.create).not.toHaveBeenCalled();
  });
});

// ============================================
// 認証
// ============================================

describe('認証', () => {
  it('トークンが一致しなければ 401（理由は返さない）', async () => {
    setupExisting();

    const response = await POST(buildRequest(BODY, { token: 'wrong-token' }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: 'Unauthorized' });
    expectNoWrites();
  });

  it('Authorization ヘッダが無ければ 401', async () => {
    setupExisting();
    const response = await POST(buildRequest(BODY, { token: null }));
    expect(response.status).toBe(401);
  });

  it('サーバ側にトークンが設定されていなければ 404（エンドポイントを隠す）', async () => {
    setupExisting();
    delete process.env.INTEGRATION_API_TOKEN;

    const response = await POST(buildRequest(BODY));

    expect(response.status).toBe(404);
  });

  it('IP許可リストが設定されていて一致しなければ 401', async () => {
    setupExisting();
    process.env.INTEGRATION_IP_ALLOWLIST = '203.0.113.10';

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-proto': 'https',
          'x-forwarded-for': '198.51.100.7',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(BODY),
      }),
    );

    expect(response.status).toBe(401);
    expectNoWrites();
  });
});
