import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================
// モック定義
// ============================================

const { mockPrisma } = vi.hoisted(() => {
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
      customerBusinessLink: model(),
      project: model(),
      customer: model(),
      customerContact: model(),
      customerBankAccount: model(),
      integrationIdempotencyKey: model(),
      $transaction: vi.fn(),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { GET } from '@/app/api/integrations/contracts/route';
import { POST as IMPORT_POST } from '@/app/api/integrations/customers/import/route';
import { CONTRACT_ITEM_KEYS } from '@/lib/contract-read';

const READ_TOKEN = 'readonly-token-xyz';
const WRITE_TOKEN = 'write-token-abc';
const URL = 'https://manage.example.test/api/integrations/contracts';

const STATUS_DEFS = [
  { statusCode: 'purchased', statusLabel: '1_購入済み' },
  { statusCode: 'applying', statusLabel: '2_申請中' },
  { statusCode: 'lost', statusLabel: '7_失注' },
];

/** 事業共通（business_id=NULL）の口座 */
const COMMON_BANK = {
  id: 2,
  businessId: null,
  bankName: 'りそな銀行',
  branchName: '目黒駅前支店',
  accountType: '普通',
  accountNumber: '1234567',
  accountHolder: 'カ）テスト',
};

function projectRow(over: Record<string, unknown> = {}, customerOver: Record<string, unknown> = {}) {
  return {
    id: 123,
    projectNo: 'LIGHT-0077',
    projectSalesStatus: 'purchased',
    projectStatusChangedAt: new Date('2026-09-15T04:12:33.000Z'),
    projectAssignedUserName: '田中太郎',
    projectNotes: '初回提案済み',
    projectCustomData: {
      needs: 'A_節税',
      unit_count: 5,
      purchase_unit_price: 2_400_000,
      purchase_amount: 12_000_000,
      purchase_count: 1,
      sales_contract_date: '2026-09-10',
      operation_contract_date: '2026-09-12',
      payment_received_date: '2026-09-14',
      thank_you_recipient: '株式会社テスト 御中',
      gratitude_certificate_name: '株式会社テスト',
      sme_agency_applicant: '山田花子',
    },
    customer: {
      id: 311,
      customerCode: 'CST-0174',
      customerName: '株式会社テスト',
      customerSalutation: 'テスト',
      customerType: '法人',
      customerPostalCode: '541-0041',
      customerAddress: '大阪府大阪市中央区…',
      customerPhone: '06-0000-0000',
      customerCorporateNumber: '9999999999999',
      customerInvoiceNumber: 'T9999999999999',
      customerFiscalMonth: 3,
      businessLinks: [{ linkCustomData: { mo_no: 'MO-79' } }],
      contacts: [
        { contactName: '山田 太郎', contactPhone: '06-0000-0001', contactEmail: 'yamada@example.test', contactIsRepresentative: true, contactIsPrimary: false },
        { contactName: '鈴木 花子', contactPhone: null, contactEmail: 'suzuki@example.test', contactIsRepresentative: false, contactIsPrimary: true },
      ],
      bankAccounts: [COMMON_BANK],
      ...customerOver,
    },
    ...over,
  };
}

function buildRequest(query = '', token: string | null = READ_TOKEN): NextRequest {
  const headers: Record<string, string> = { 'x-forwarded-proto': 'https' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`${URL}${query}`, { method: 'GET', headers });
}

/** DBへの書き込みが1件も発生していないこと */
function expectNoWrites() {
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === 'function') continue;
    for (const name of ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']) {
      expect((model as Record<string, { mock?: unknown }>)[name]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTEGRATION_READONLY_TOKEN = READ_TOKEN;
  process.env.INTEGRATION_API_TOKEN = WRITE_TOKEN;
  process.env.INTEGRATION_BUSINESS_CODE = 'LIGHT';
  process.env.NEXTAUTH_URL = 'https://manage.example.test';
  delete process.env.INTEGRATION_IP_ALLOWLIST;

  mockPrisma.business.findFirst.mockResolvedValue({ id: 5, businessCode: 'LIGHT' });
  mockPrisma.business.findUnique.mockResolvedValue({
    businessConfig: {
      projectFields: [
        { key: 'purchase_unit_price', label: '購入単価', type: 'number' },
        { key: 'unit_count', label: '台数', type: 'number' },
        { key: 'purchase_amount', label: '購入金額', type: 'formula', formula: 'purchase_unit_price* unit_count' },
      ],
    },
  });
  mockPrisma.businessStatusDefinition.findMany.mockResolvedValue(STATUS_DEFS);
  mockPrisma.project.count.mockResolvedValue(0);
  mockPrisma.project.findMany.mockResolvedValue([projectRow()]);
});

// ============================================
// 検証観点 1〜3: status
// ============================================

describe('status', () => {
  it('指定なしならステータスで絞らない', async () => {
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    const where = mockPrisma.project.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.projectSalesStatus).toBeUndefined();
    expect(json.items).toHaveLength(1);
  });

  it('コード指定はそのステータスだけに絞る', async () => {
    const response = await GET(buildRequest('?status=purchased'));
    const json = await response.json();

    expect(response.status).toBe(200);
    const where = mockPrisma.project.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.projectSalesStatus).toBe('purchased');
    expect(json.items[0].status_code).toBe('purchased');
    expect(json.items[0].status).toBe('1_購入済み');
  });

  it('ラベルを渡したら 422（コードを案内する）', async () => {
    const response = await GET(buildRequest('?status=' + encodeURIComponent('1_購入済み')));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error).toBe('Validation failed');
    expect(json.errors[0].field).toBe('status');
    expect(json.errors[0].message).toContain('purchased');
    expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
  });

  it('存在しないコードも 422', async () => {
    const response = await GET(buildRequest('?status=unknown_code'));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.errors[0].field).toBe('status');
  });
});

// ============================================
// 検証観点 4・10: updated_since
// ============================================

describe('updated_since', () => {
  it('未来日時なら空配列（エラーにしない）', async () => {
    mockPrisma.project.findMany.mockResolvedValue([]);

    const response = await GET(buildRequest('?updated_since=2099-01-01T00:00:00Z'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.items).toEqual([]);
    expect(json.meta.count).toBe(0);
    expect(json.next_cursor).toBeNull();
  });

  it('指定した日時以降のステータス変更だけに絞る', async () => {
    await GET(buildRequest('?updated_since=2026-09-11T00:00:00Z'));

    const where = mockPrisma.project.findMany.mock.calls[0][0].where as {
      projectStatusChangedAt: { gte: Date };
    };
    expect(where.projectStatusChangedAt.gte.toISOString()).toBe('2026-09-11T00:00:00.000Z');
  });

  it('形式が不正なら 422（どのフィールドか分かる）', async () => {
    const response = await GET(buildRequest('?updated_since=先週'));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.errors).toEqual([
      { field: 'updated_since', message: expect.stringContaining('ISO 8601') },
    ]);
  });
});

// ============================================
// 検証観点 5: ページング
// ============================================

describe('ページング', () => {
  /** (status_changed_at, id) 昇順のデータセットに対して findMany を再現する */
  function setupDataset(count: number) {
    const rows = Array.from({ length: count }, (_, i) =>
      projectRow({
        id: 100 + i,
        projectNo: `LIGHT-${String(i).padStart(4, '0')}`,
        projectStatusChangedAt: new Date(Date.UTC(2026, 8, 1 + i)),
      }),
    );
    mockPrisma.project.findMany.mockImplementation(async (args: Record<string, unknown>) => {
      const where = args.where as Record<string, unknown>;
      const take = args.take as number;
      let list = [...rows].sort(
        (a, b) => a.projectStatusChangedAt.getTime() - b.projectStatusChangedAt.getTime() || a.id - b.id,
      );
      const cond = (where.AND as Array<Record<string, unknown>> | undefined)?.[1];
      if (cond) {
        const or = cond.OR as Array<Record<string, unknown>> | undefined;
        if (or) {
          const gt = (or[0].projectStatusChangedAt as { gt: Date }).gt;
          const eq = or[1].projectStatusChangedAt as Date;
          const idGt = (or[1].id as { gt: number }).gt;
          list = list.filter(
            (r) =>
              r.projectStatusChangedAt > gt ||
              (r.projectStatusChangedAt.getTime() === eq.getTime() && r.id > idGt),
          );
        }
      }
      return list.slice(0, take);
    });
    return rows;
  }

  it('limit を超えたら next_cursor を返し、辿ると重複・欠落なく全件取れる', async () => {
    const rows = setupDataset(7);

    const collected: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const query: string = `?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const response = await GET(buildRequest(query));
      const json = await response.json();
      expect(response.status).toBe(200);
      collected.push(...json.items.map((x: { project_no: string }) => x.project_no));
      cursor = json.next_cursor;
      if (!cursor) break;
    }

    expect(collected).toEqual(rows.map((r) => r.projectNo));
    expect(new Set(collected).size).toBe(rows.length); // 重複なし
    expect(cursor).toBeNull(); // 最終ページで打ち切られている
  });

  it('limit ちょうどで終わる場合も次ページを返さない', async () => {
    setupDataset(3);

    const response = await GET(buildRequest('?limit=3'));
    const json = await response.json();

    expect(json.items).toHaveLength(3);
    expect(json.next_cursor).toBeNull();
  });

  it('不正な cursor は 422', async () => {
    const response = await GET(buildRequest('?cursor=not-a-cursor'));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.errors[0].field).toBe('cursor');
  });

  it('limit の範囲外は 422', async () => {
    const response = await GET(buildRequest('?limit=501'));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.errors[0].field).toBe('limit');
  });
});

// ============================================
// 検証観点 6・7: 口座
// ============================================

describe('口座', () => {
  it('口座未登録なら口座系は null・scope も null（500にしない）', async () => {
    mockPrisma.project.findMany.mockResolvedValue([projectRow({}, { bankAccounts: [] })]);

    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    const item = json.items[0];
    expect(item.bank_name).toBeNull();
    expect(item.account_no).toBeNull();
    expect(item.bank_account_scope).toBeNull();
  });

  it('事業共通口座しか無ければ返しつつ scope は common', async () => {
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(json.items[0].bank_account_scope).toBe('common');
    expect(json.items[0].account_no).toBe('1234567'); // 平文（マスクしない）
  });

  it('事業の口座があればそちらを優先し scope は business', async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      projectRow({}, {
        bankAccounts: [
          COMMON_BANK,
          { ...COMMON_BANK, id: 9, businessId: 5, bankName: '三井住友銀行', accountNumber: '7654321' },
        ],
      }),
    ]);

    const response = await GET(buildRequest());
    const json = await response.json();

    expect(json.items[0].bank_account_scope).toBe('business');
    expect(json.items[0].bank_name).toBe('三井住友銀行');
  });

  it('口座の読み出しは事業と事業共通の両方を対象にする', async () => {
    await GET(buildRequest());

    const select = mockPrisma.project.findMany.mock.calls[0][0].select as {
      customer: { select: { bankAccounts: { where: unknown } } };
    };
    expect(select.customer.select.bankAccounts.where).toEqual({
      OR: [{ businessId: 5 }, { businessId: null }],
    });
  });
});

// ============================================
// 検証観点 8・9: トークンの分離
// ============================================

describe('認証', () => {
  it('読み出し専用トークンで 200', async () => {
    const response = await GET(buildRequest());
    expect(response.status).toBe(200);
  });

  it('書き込み用トークンでは 401（読み出し専用トークンのみ受け付ける）', async () => {
    const response = await GET(buildRequest('', WRITE_TOKEN));
    expect(response.status).toBe(401);
    expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
  });

  it('トークン無しは 401', async () => {
    const response = await GET(buildRequest('', null));
    expect(response.status).toBe(401);
  });

  it('読み出し専用トークンが未設定なら 404（エンドポイントを隠す）', async () => {
    delete process.env.INTEGRATION_READONLY_TOKEN;
    const response = await GET(buildRequest());
    expect(response.status).toBe(404);
  });

  it('読み出し専用トークンで取り込みAPI（POST）は叩けない', async () => {
    const request = new NextRequest('https://manage.example.test/api/integrations/customers/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https',
        authorization: `Bearer ${READ_TOKEN}`,
      },
      body: JSON.stringify({ mo_no: 'MO-79' }),
    });

    const response = await IMPORT_POST(request);
    expect(response.status).toBe(401);
    expectNoWrites();
  });
});

// ============================================
// 検証観点 11・12: 読み取り専用・キー集合
// ============================================

describe('レスポンス', () => {
  it('同じリクエストを2回投げてもDBへの書き込みが発生しない', async () => {
    await GET(buildRequest('?status=purchased'));
    await GET(buildRequest('?status=purchased'));
    expectNoWrites();
  });

  it('値が全て未入力でもキーが欠落しない', async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      projectRow(
        {
          projectStatusChangedAt: null,
          projectAssignedUserName: null,
          projectNotes: null,
          projectCustomData: {},
        },
        {
          customerSalutation: null,
          customerPostalCode: null,
          customerAddress: null,
          customerPhone: null,
          customerCorporateNumber: null,
          customerInvoiceNumber: null,
          customerFiscalMonth: null,
          businessLinks: [],
          contacts: [],
          bankAccounts: [],
        },
      ),
    ]);

    const response = await GET(buildRequest());
    const json = await response.json();
    const item = json.items[0];

    expect(Object.keys(item).sort()).toEqual([...CONTRACT_ITEM_KEYS].sort());
    // 必ず入る3つ以外は null
    const alwaysPresent = ['project_no', 'project_url', 'customer_id', 'customer_code', 'customer_url', 'status_code', 'status', 'company_name', 'customer_type'];
    for (const [key, value] of Object.entries(item)) {
      if (!alwaysPresent.includes(key)) expect(value, `${key} は null であるべき`).toBeNull();
    }
  });

  it('中企庁申請者が空文字なら null で返す', async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      projectRow({ projectCustomData: { sme_agency_applicant: '' } }),
    ]);

    const response = await GET(buildRequest());
    const item = (await response.json()).items[0];

    expect(item).toHaveProperty('sme_agency_applicant', null);
  });

  it('生の値をそのまま返す（ニーズ・決算月を整形しない）', async () => {
    const response = await GET(buildRequest());
    const item = (await response.json()).items[0];

    expect(item.needs).toBe('A_節税');
    expect(item.fiscal_month).toBe(3); // "3月" にしない
    expect(item.unit_count).toBe(5);
    expect(item.customer_salutation).toBe('テスト');
    expect(item.assigned_user_name).toBe('田中太郎');
    expect(item.project_notes).toBe('初回提案済み');
    expect(item.thank_you_recipient).toBe('株式会社テスト 御中');
    expect(item.gratitude_certificate_name).toBe('株式会社テスト');
    expect(item.sme_agency_applicant).toBe('山田花子');
  });

  it('購入金額は数式（購入単価×台数）を再計算して返す', async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      projectRow({
        projectCustomData: {
          unit_count: 5,
          purchase_unit_price: 2_400_000,
          purchase_amount: 1, // 保存値が古くても再計算する
        },
      }),
    ]);

    const response = await GET(buildRequest());
    const item = (await response.json()).items[0];

    expect(item.purchase_amount).toBe(12_000_000);
    expect(item.unit_price).toBe(2_400_000);
  });

  it('URL と匿名でない識別子を返す', async () => {
    const item = (await (await GET(buildRequest())).json()).items[0];

    expect(item.project_url).toBe('https://manage.example.test/projects/123');
    expect(item.customer_url).toBe('https://manage.example.test/customers/311');
    expect(item.mo_no).toBe('MO-79');
  });

  it('担当者は代表者以外の主担当を1名だけ返す', async () => {
    const item = (await (await GET(buildRequest())).json()).items[0];

    expect(item.representative_name).toBe('山田 太郎');
    expect(item.representative_phone).toBe('06-0000-0001');
    expect(item.contact_name).toBe('鈴木 花子');
    expect(item.contact_phone).toBeNull();
    expect(item.contact_email).toBe('suzuki@example.test');
  });
});

// ============================================
// 除外件数
// ============================================

describe('meta', () => {
  it('無効な案件・無効な顧客は除外し、件数を meta で返す', async () => {
    mockPrisma.project.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const response = await GET(buildRequest('?status=purchased'));
    const json = await response.json();

    expect(json.meta).toEqual({ count: 1, excluded_inactive_projects: 2, excluded_inactive_customers: 1 });

    const where = mockPrisma.project.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.projectIsActive).toBe(true);
    expect(where.customer).toEqual({ customerIsActive: true });
  });

  it('mo_no が見つからなければ空で返す（500にしない）', async () => {
    mockPrisma.customerBusinessLink.findMany.mockResolvedValue([]);

    const response = await GET(buildRequest('?mo_no=MO-XXXX'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.items).toEqual([]);
    expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
  });

  it('mo_no 指定はその顧客の案件だけに絞る', async () => {
    mockPrisma.customerBusinessLink.findMany.mockResolvedValue([{ customerId: 311 }]);

    await GET(buildRequest('?mo_no=MO-79'));

    const where = mockPrisma.project.findMany.mock.calls[0][0].where as { customerId: { in: number[] } };
    expect(where.customerId).toEqual({ in: [311] });
  });
});
