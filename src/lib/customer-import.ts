// ============================================
// 購入申込フォーム顧客情報の取り込み（外部システム連携）
// ============================================
//
// 呼び出し元は m2 の外にある Python スクリプト（push_to_m2.py）。
//
// 設計上の決めごと（Cowork 側と合意済み / 2026-07-30 の仕様変更を反映）:
//
//   1. 顧客の特定キーは `mo_no`（MO番号）だけ。
//      格納先は既存の事業別カスタムフィールド:
//        businesses.business_config.customerFields = [{key:"mo_no", label:"MO番号"}]
//        実データ = customer_business_links.link_custom_data->>'mo_no'（事業=ライト事業）
//      専用カラムは作らない。
//
//   2. 既定は「更新のみ」。mo_no で見つからなければ 404。
//      `allow_create: true` のときだけ新規作成する。
//
//   3. 食い違いは黙って上書きしない。
//        - 既存が空欄        → 自動で埋める（filled_fields）
//        - 既存と送信値が相違 → conflicts に「既存値・送信値」を入れて返し、DBは変更しない
//        - `overwrite_fields` に列挙された項目だけ上書きする（updated_fields）
//
//   4. `dry_run: true` は DB を一切変更せず、filled_fields / updated_fields /
//      conflicts / warnings だけを返す。冪等キーも消費しない（ルート側で制御）。
//
//   その他:
//   - industry はマスタに一致すれば紐付け、無ければ null + 警告。マスタは自動作成しない
//   - 紐付かなかった業種文字列は industry_raw として事業別カスタムデータに残す
//   - gratitude_addressee は customer_salutation ではなく事業別カスタムデータへ
//     （感謝状の宛名であり、通常の顧客宛名とは別物）

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateCustomerCode } from '@/lib/customer-code';

// ============================================
// 入力スキーマ
// ============================================

/** 空文字を null に正規化する（送信側の「未入力」を統一的に扱う） */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const nullableString = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max).nullable().optional());

const contactSchema = z.object({
  role: z.enum(['main', 'cc']),
  name: z.string().min(1, 'name は必須です').max(100),
  department: z.preprocess(emptyToNull, z.string().max(100).nullable().optional()),
  email: z.preprocess(
    emptyToNull,
    z.string().email('メールアドレスの形式が不正です').max(255).nullable().optional(),
  ),
});

export const customerImportSchema = z
  .object({
    // --- 制御項目 ---------------------------------------------------------
    /** 顧客の特定キー。これだけが必須 */
    mo_no: z.string().min(1, 'mo_no は必須です').max(50),
    /** true のときだけ新規作成を許す（既定は更新のみ） */
    allow_create: z.boolean().optional().default(false),
    /** true なら DB を一切変更せず、判定結果だけ返す */
    dry_run: z.boolean().optional().default(false),
    /** 既存値と食い違う項目のうち、上書きを許可する項目名 */
    overwrite_fields: z.array(z.string()).optional().default([]),

    // --- データ項目（すべて任意。allow_create=true のときだけ必須チェック） ---
    form_submitted_at: nullableString(40),
    customer_type: z.preprocess(
      emptyToNull,
      z
        .enum(['法人', '個人事業主', '個人'], {
          errorMap: () => ({ message: 'customer_type は 法人 / 個人事業主 / 個人 のいずれかです' }),
        })
        .nullable()
        .optional(),
    ),
    company_name: nullableString(200),
    postal_code: nullableString(10),
    address: nullableString(2000),
    phone: nullableString(20),
    representative_name: nullableString(100),
    established_on: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'established_on は YYYY-MM-DD 形式です')
        .nullable()
        .optional(),
    ),
    corporate_no: z.preprocess(
      emptyToNull,
      z.string().regex(/^\d{13}$/, 'corporate_no は13桁の数字です').nullable().optional(),
    ),
    invoice_no: z.preprocess(
      emptyToNull,
      z.string().regex(/^T\d{13}$/, 'invoice_no は T + 13桁の数字です').nullable().optional(),
    ),
    fiscal_month: z.preprocess(
      emptyToNull,
      z.coerce
        .number()
        .int()
        .min(1, 'fiscal_month は1〜12です')
        .max(12, 'fiscal_month は1〜12です')
        .nullable()
        .optional(),
    ),
    industry: nullableString(100),
    company_email: z.preprocess(
      emptyToNull,
      z.string().email('company_email の形式が不正です').max(255).nullable().optional(),
    ),
    bank_name: nullableString(100),
    branch_name: nullableString(100),
    account_type: z.preprocess(
      emptyToNull,
      z
        .enum(['普通', '当座'], {
          errorMap: () => ({ message: 'account_type は 普通 / 当座 のいずれかです' }),
        })
        .nullable()
        .optional(),
    ),
    account_no: nullableString(20),
    account_holder: nullableString(100),
    contacts: z.array(contactSchema).optional().default([]),
    gbiz_id_prime: nullableString(100),
    kyoka_zeisei_history: nullableString(2000),
    gratitude_addressee: nullableString(200),
    delivery_address: nullableString(500),
  })
  .superRefine((data, ctx) => {
    // 新規作成を許可するときだけ、最低限の項目を要求する。
    // 更新のみ（既定）なら送りたい項目だけ送れる。
    if (!data.allow_create) return;

    const required: Array<[keyof typeof data, string]> = [
      ['company_name', 'company_name'],
      ['address', 'address'],
      ['representative_name', 'representative_name'],
      ['customer_type', 'customer_type'],
    ];
    for (const [key, field] of required) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `allow_create=true のとき ${field} は必須です`,
        });
      }
    }
    // 法人のみ法人番号必須（個人事業主・個人は法人番号を持たない）
    if (data.customer_type === '法人' && !data.corporate_no) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['corporate_no'],
        message: 'customer_type が「法人」で allow_create=true のとき corporate_no は必須です',
      });
    }
  });

export type CustomerImportInput = z.infer<typeof customerImportSchema>;

/** Zod エラー → API レスポンス用の配列（どのフィールドがなぜ落ちたか） */
export function toValidationErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((e) => ({
    field: e.path.join('.') || '(root)',
    message: e.message,
  }));
}

// ============================================
// エラー
// ============================================

/** mo_no で顧客が見つからず、allow_create でもない（→ 404） */
export class CustomerNotFoundError extends Error {
  constructor(public readonly moNo: string) {
    super(`mo_no=${moNo} の顧客が見つかりません`);
    this.name = 'CustomerNotFoundError';
  }
}

/** 取り込みを続けると既存データの整合性を壊す場合（→ 409） */
export class CustomerImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerImportConflictError';
  }
}

// ============================================
// 取り込み結果
// ============================================

export interface FieldConflict {
  field: string;
  existing: string | null;
  incoming: string;
}

export interface CustomerImportResult {
  /** dry_run で新規作成が想定される場合のみ null */
  id: number | null;
  created: boolean;
  dryRun: boolean;
  /** 既存が空欄だったので自動で埋めた項目 */
  filledFields: string[];
  /** overwrite_fields の指定に従って上書きした項目 */
  updatedFields: string[];
  /** 既存値と食い違い、上書き指定が無かったため据え置いた項目 */
  conflicts: FieldConflict[];
  warnings: string[];
}

// ============================================
// 変更計画（dry_run と本実行で同じ判定を通す）
// ============================================

type PlanAction = 'fill' | 'overwrite' | 'conflict' | 'same';

interface PlannedChange {
  field: string;
  existing: string | null;
  incoming: string;
  action: PlanAction;
  /** action が fill / overwrite のときだけ持つ。dry_run では呼ばない */
  apply?: () => Promise<void>;
}

class ChangePlan {
  private readonly plans: PlannedChange[] = [];

  constructor(private readonly overwriteFields: Set<string>) {}

  /**
   * 1項目分の判定を積む。
   * @param incoming 送信値（null / 空なら何もしない＝既存値を保持）
   * @param existing 既存値（null / 空なら「空欄」＝自動で埋める）
   */
  add(
    field: string,
    incoming: string | null,
    existing: string | null,
    apply: () => Promise<void>,
  ): void {
    if (incoming === null || incoming === '') return; // 送信側が空 → 触らない

    const isEmpty = existing === null || existing === '';
    if (isEmpty) {
      this.plans.push({ field, existing, incoming, action: 'fill', apply });
      return;
    }
    if (existing === incoming) {
      this.plans.push({ field, existing, incoming, action: 'same' });
      return;
    }
    if (this.overwriteFields.has(field)) {
      this.plans.push({ field, existing, incoming, action: 'overwrite', apply });
      return;
    }
    this.plans.push({ field, existing, incoming, action: 'conflict' });
  }

  get filledFields(): string[] {
    return this.plans.filter((p) => p.action === 'fill').map((p) => p.field);
  }

  get updatedFields(): string[] {
    return this.plans.filter((p) => p.action === 'overwrite').map((p) => p.field);
  }

  get conflicts(): FieldConflict[] {
    return this.plans
      .filter((p) => p.action === 'conflict')
      .map((p) => ({ field: p.field, existing: p.existing, incoming: p.incoming }));
  }

  /** 適用対象（fill / overwrite）があるか */
  get hasChanges(): boolean {
    return this.plans.some((p) => p.action === 'fill' || p.action === 'overwrite');
  }

  /** dry_run では呼ばない */
  async applyAll(): Promise<void> {
    for (const plan of this.plans) {
      if ((plan.action === 'fill' || plan.action === 'overwrite') && plan.apply) {
        await plan.apply();
      }
    }
  }
}

// ============================================
// 値の表示用正規化
// ============================================

function toDisplay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return String(value);
}

// ============================================
// 本体
// ============================================

export async function importCustomer(
  input: CustomerImportInput,
  business: { id: number; businessCode: string },
): Promise<CustomerImportResult> {
  return prisma.$transaction(async (tx) => {
    const warnings: string[] = [];
    const plan = new ChangePlan(new Set(input.overwrite_fields));

    // --- 業種マスタの解決（自動作成はしない） ---------------------------
    let industryId: number | null = null;
    let industryName: string | null = null;
    if (input.industry) {
      const industry = await tx.industry.findFirst({
        where: { industryName: input.industry },
        select: { id: true, industryName: true },
      });
      if (industry) {
        industryId = industry.id;
        industryName = industry.industryName;
      } else {
        warnings.push(`industry マスタ未一致：${input.industry}`);
      }
    }

    // --- mo_no で既存顧客を特定 -------------------------------------------
    // MO番号は事業別カスタムデータ（link_custom_data.mo_no）に入っている。
    const link = await tx.customerBusinessLink.findFirst({
      where: {
        businessId: business.id,
        linkCustomData: { path: ['mo_no'], equals: input.mo_no },
      },
      select: { id: true, customerId: true, linkCustomData: true },
    });

    if (!link) {
      if (!input.allow_create) throw new CustomerNotFoundError(input.mo_no);
      return createCustomer(tx, input, business, {
        industryId,
        industryName,
        warnings,
      });
    }

    // --- 既存顧客の現在値を読む -------------------------------------------
    const customer = await tx.customer.findUnique({
      where: { id: link.customerId },
      select: {
        id: true,
        customerName: true,
        customerType: true,
        customerPostalCode: true,
        customerAddress: true,
        customerPhone: true,
        customerEmail: true,
        customerCorporateNumber: true,
        customerInvoiceNumber: true,
        customerFiscalMonth: true,
        customerEstablishedDate: true,
        industryId: true,
        industry: { select: { industryName: true } },
        contacts: {
          select: {
            id: true,
            contactName: true,
            contactDepartment: true,
            contactEmail: true,
            contactIsRepresentative: true,
            contactIsPrimary: true,
          },
          orderBy: [{ contactSortOrder: 'asc' }, { id: 'asc' }],
        },
        bankAccounts: {
          where: { businessId: business.id },
          select: {
            id: true,
            bankName: true,
            branchName: true,
            accountType: true,
            accountNumber: true,
            accountHolder: true,
          },
          orderBy: { id: 'asc' },
          take: 1,
        },
      },
    });

    if (!customer) {
      // link はあるのに顧客が無い（データ不整合）
      throw new CustomerImportConflictError(
        `mo_no=${input.mo_no} の事業リンクは存在しますが、顧客レコード（id=${link.customerId}）が見つかりません`,
      );
    }

    const customerId = customer.id;
    // 顧客本体のスカラー更新はまとめて1回の update にする
    const scalarChanges: Record<string, unknown> = {};
    const stageScalar = (column: string, value: unknown) => async () => {
      scalarChanges[column] = value;
    };

    // --- 顧客本体のスカラー項目 -------------------------------------------
    plan.add('company_name', input.company_name ?? null, toDisplay(customer.customerName),
      stageScalar('customerName', input.company_name));
    // customerType は既定値 "未設定" が入っているため、それは「空欄」として扱う
    plan.add('customer_type', input.customer_type ?? null,
      customer.customerType === '未設定' ? null : toDisplay(customer.customerType),
      stageScalar('customerType', input.customer_type));
    plan.add('postal_code', input.postal_code ?? null, toDisplay(customer.customerPostalCode),
      stageScalar('customerPostalCode', input.postal_code));
    plan.add('address', input.address ?? null, toDisplay(customer.customerAddress),
      stageScalar('customerAddress', input.address));
    plan.add('phone', input.phone ?? null, toDisplay(customer.customerPhone),
      stageScalar('customerPhone', input.phone));
    plan.add('company_email', input.company_email ?? null, toDisplay(customer.customerEmail),
      stageScalar('customerEmail', input.company_email));
    plan.add('corporate_no', input.corporate_no ?? null, toDisplay(customer.customerCorporateNumber),
      stageScalar('customerCorporateNumber', input.corporate_no));
    plan.add('invoice_no', input.invoice_no ?? null, toDisplay(customer.customerInvoiceNumber),
      stageScalar('customerInvoiceNumber', input.invoice_no));
    plan.add('fiscal_month', toDisplay(input.fiscal_month ?? null), toDisplay(customer.customerFiscalMonth),
      stageScalar('customerFiscalMonth', input.fiscal_month));
    plan.add('established_on', input.established_on ?? null, toDisplay(customer.customerEstablishedDate),
      stageScalar(
        'customerEstablishedDate',
        input.established_on ? new Date(`${input.established_on}T00:00:00.000Z`) : null,
      ));
    if (industryId !== null) {
      plan.add('industry', industryName, toDisplay(customer.industry?.industryName ?? null),
        stageScalar('industryId', industryId));
    }

    // --- 連絡先 -----------------------------------------------------------
    const contactRoles: Record<string, string> = {};
    let representativeContactId: number | null =
      customer.contacts.find((c) => c.contactIsRepresentative)?.id ?? null;

    // 代表者
    if (input.representative_name) {
      const rep = customer.contacts.find((c) => c.contactIsRepresentative) ?? null;
      plan.add('representative_name', input.representative_name, toDisplay(rep?.contactName ?? null),
        async () => {
          if (rep) {
            await tx.customerContact.update({
              where: { id: rep.id },
              data: { contactName: input.representative_name as string },
            });
            representativeContactId = rep.id;
          } else {
            const created = await tx.customerContact.create({
              data: {
                customerId,
                contactName: input.representative_name as string,
                contactIsRepresentative: true,
              },
              select: { id: true },
            });
            representativeContactId = created.id;
            await tx.customerContactBusinessLink.createMany({
              data: [{ contactId: created.id, businessId: business.id }],
              skipDuplicates: true,
            });
          }
        });
    }

    // contacts[]
    for (const incoming of input.contacts) {
      const matchKey = incoming.email ?? incoming.name;
      const existingContact =
        (incoming.email
          ? customer.contacts.find((c) => !c.contactIsRepresentative && c.contactEmail === incoming.email)
          : null) ??
        customer.contacts.find((c) => !c.contactIsRepresentative && c.contactName === incoming.name) ??
        null;

      if (!existingContact) {
        // 連絡先そのものが無い → 追加（空欄を埋める扱い）
        plan.add(
          `contacts[${matchKey}]`,
          [incoming.name, incoming.department, incoming.email].filter(Boolean).join(' / '),
          null,
          async () => {
            if (incoming.role === 'main') {
              await tx.customerContact.updateMany({
                where: { customerId, contactIsPrimary: true },
                data: { contactIsPrimary: false },
              });
            }
            const created = await tx.customerContact.create({
              data: {
                customerId,
                contactName: incoming.name,
                contactDepartment: incoming.department ?? null,
                contactEmail: incoming.email ?? null,
                contactIsPrimary: incoming.role === 'main',
              },
              select: { id: true },
            });
            contactRoles[String(created.id)] = incoming.role;
            await tx.customerContactBusinessLink.createMany({
              data: [{ contactId: created.id, businessId: business.id }],
              skipDuplicates: true,
            });
          },
        );
        continue;
      }

      // 既存連絡先の項目ごとに判定
      contactRoles[String(existingContact.id)] = incoming.role;
      plan.add(`contacts[${matchKey}].name`, incoming.name, toDisplay(existingContact.contactName),
        async () => {
          await tx.customerContact.update({
            where: { id: existingContact.id },
            data: { contactName: incoming.name },
          });
        });
      plan.add(
        `contacts[${matchKey}].department`,
        incoming.department ?? null,
        toDisplay(existingContact.contactDepartment),
        async () => {
          await tx.customerContact.update({
            where: { id: existingContact.id },
            data: { contactDepartment: incoming.department ?? null },
          });
        },
      );
      plan.add(
        `contacts[${matchKey}].email`,
        incoming.email ?? null,
        toDisplay(existingContact.contactEmail),
        async () => {
          await tx.customerContact.update({
            where: { id: existingContact.id },
            data: { contactEmail: incoming.email ?? null },
          });
        },
      );
    }

    // --- 銀行口座 ---------------------------------------------------------
    const bank = customer.bankAccounts[0] ?? null;
    const bankIncoming = {
      bank_name: input.bank_name ?? null,
      branch_name: input.branch_name ?? null,
      account_type: input.account_type ?? null,
      account_no: input.account_no ?? null,
      account_holder: input.account_holder ?? null,
    };
    const bankProvided = Object.values(bankIncoming).filter((v) => v != null).length;

    if (bank) {
      // 既存口座あり → 項目単位で判定できる
      plan.add('bank_name', bankIncoming.bank_name, toDisplay(bank.bankName), async () => {
        await tx.customerBankAccount.update({
          where: { id: bank.id },
          data: { bankName: bankIncoming.bank_name as string },
        });
      });
      plan.add('branch_name', bankIncoming.branch_name, toDisplay(bank.branchName), async () => {
        await tx.customerBankAccount.update({
          where: { id: bank.id },
          data: { branchName: bankIncoming.branch_name as string },
        });
      });
      plan.add('account_type', bankIncoming.account_type, toDisplay(bank.accountType), async () => {
        await tx.customerBankAccount.update({
          where: { id: bank.id },
          data: { accountType: bankIncoming.account_type as string },
        });
      });
      plan.add('account_no', bankIncoming.account_no, toDisplay(bank.accountNumber), async () => {
        await tx.customerBankAccount.update({
          where: { id: bank.id },
          data: { accountNumber: bankIncoming.account_no as string },
        });
      });
      plan.add('account_holder', bankIncoming.account_holder, toDisplay(bank.accountHolder), async () => {
        await tx.customerBankAccount.update({
          where: { id: bank.id },
          data: { accountHolder: bankIncoming.account_holder as string },
        });
      });
    } else if (bankProvided > 0 && bankProvided < 5) {
      warnings.push(
        '口座が未登録で、かつ口座情報が不完全なため登録していません（新規登録には bank_name / branch_name / account_type / account_no / account_holder のすべてが必要です）',
      );
    } else if (bankProvided === 5) {
      // 口座そのものが無い → 追加（空欄を埋める扱い）
      plan.add('bank_account', `${bankIncoming.bank_name} ${bankIncoming.branch_name} ${bankIncoming.account_type}`, null, async () => {
        await tx.customerBankAccount.create({
          data: {
            customerId,
            businessId: business.id,
            bankName: bankIncoming.bank_name as string,
            branchName: bankIncoming.branch_name as string,
            accountType: bankIncoming.account_type as string,
            accountNumber: bankIncoming.account_no as string,
            accountHolder: bankIncoming.account_holder as string,
          },
        });
      });
    }

    // --- 事業別カスタムデータ ---------------------------------------------
    const previousLinkData = (link.linkCustomData as Record<string, unknown> | null) ?? {};
    const linkDataChanges: Record<string, unknown> = {};
    const stageLink = (key: string, value: unknown) => async () => {
      linkDataChanges[key] = value;
    };

    const linkFields: Array<[string, string | null]> = [
      ['industry_raw', input.industry ?? null],
      ['gbiz_id_prime', input.gbiz_id_prime ?? null],
      ['kyoka_zeisei_history', input.kyoka_zeisei_history ?? null],
      ['gratitude_addressee', input.gratitude_addressee ?? null],
      ['delivery_address', input.delivery_address ?? null],
    ];
    for (const [key, incoming] of linkFields) {
      plan.add(key, incoming, toDisplay(previousLinkData[key] ?? null), stageLink(key, incoming));
    }

    // --- 適用（dry_run では書き込まない） ---------------------------------
    if (!input.dry_run) {
      await plan.applyAll();

      if (Object.keys(scalarChanges).length > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { ...scalarChanges, version: { increment: 1 } } as Prisma.CustomerUncheckedUpdateInput,
        });
      }

      // 提出日時・連絡先ロールは「顧客データの更新」ではないため
      // filled_fields / updated_fields には含めず、常に最新を保持する
      const mergedLinkData: Record<string, unknown> = {
        ...previousLinkData,
        ...linkDataChanges,
        mo_no: input.mo_no,
        ...(input.form_submitted_at ? { form_submitted_at: input.form_submitted_at } : {}),
        ...(Object.keys(contactRoles).length > 0
          ? { contact_roles: { ...((previousLinkData.contact_roles as object) ?? {}), ...contactRoles } }
          : {}),
        ...(representativeContactId !== null
          ? { representative_contact_id: representativeContactId }
          : {}),
      };
      await tx.customerBusinessLink.update({
        where: { id: link.id },
        data: { linkCustomData: mergedLinkData as Prisma.InputJsonValue },
      });
    }

    return {
      id: customerId,
      created: false,
      dryRun: input.dry_run,
      filledFields: plan.filledFields,
      updatedFields: plan.updatedFields,
      conflicts: plan.conflicts,
      warnings,
    };
  });
}

// ============================================
// 新規作成（allow_create=true かつ mo_no 未ヒットのとき）
// ============================================

async function createCustomer(
  tx: Prisma.TransactionClient,
  input: CustomerImportInput,
  business: { id: number },
  ctx: { industryId: number | null; industryName: string | null; warnings: string[] },
): Promise<CustomerImportResult> {
  // 新規作成で埋まる項目（レスポンスの filled_fields に載せる）
  const filledFields: string[] = [];
  const scalars: Record<string, unknown> = {};
  const put = (column: string, field: string, value: unknown) => {
    if (value === null || value === undefined) return;
    scalars[column] = value;
    filledFields.push(field);
  };

  put('customerName', 'company_name', input.company_name);
  put('customerType', 'customer_type', input.customer_type);
  put('customerPostalCode', 'postal_code', input.postal_code);
  put('customerAddress', 'address', input.address);
  put('customerPhone', 'phone', input.phone);
  put('customerEmail', 'company_email', input.company_email);
  put('customerCorporateNumber', 'corporate_no', input.corporate_no);
  put('customerInvoiceNumber', 'invoice_no', input.invoice_no);
  put('customerFiscalMonth', 'fiscal_month', input.fiscal_month);
  put(
    'customerEstablishedDate',
    'established_on',
    input.established_on ? new Date(`${input.established_on}T00:00:00.000Z`) : null,
  );
  put('industryId', 'industry', ctx.industryId);

  if (input.representative_name) filledFields.push('representative_name');
  for (const c of input.contacts) filledFields.push(`contacts[${c.email ?? c.name}]`);

  const linkData: Record<string, unknown> = { mo_no: input.mo_no };
  const putLink = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    linkData[key] = value;
    filledFields.push(key);
  };
  putLink('industry_raw', input.industry);
  putLink('gbiz_id_prime', input.gbiz_id_prime);
  putLink('kyoka_zeisei_history', input.kyoka_zeisei_history);
  putLink('gratitude_addressee', input.gratitude_addressee);
  putLink('delivery_address', input.delivery_address);

  const bankComplete =
    [input.bank_name, input.branch_name, input.account_type, input.account_no, input.account_holder]
      .filter((v) => v != null).length === 5;
  const bankPartial =
    !bankComplete &&
    [input.bank_name, input.branch_name, input.account_type, input.account_no, input.account_holder]
      .some((v) => v != null);
  if (bankPartial) {
    ctx.warnings.push(
      '口座情報が不完全なため登録していません（bank_name / branch_name / account_type / account_no / account_holder はすべて必要です）',
    );
  }
  if (bankComplete) filledFields.push('bank_account');

  // dry_run: 何も書かずに「これから作る」ことだけ返す
  if (input.dry_run) {
    return {
      id: null,
      created: true,
      dryRun: true,
      filledFields,
      updatedFields: [],
      conflicts: [],
      warnings: ctx.warnings,
    };
  }

  const customerCode = await generateCustomerCode(tx);
  const created = await tx.customer.create({
    data: {
      ...scalars,
      customerCode,
      // 感謝状の宛名は customerSalutation ではないため、正規の宛名が届くまで null
      customerSalutation: null,
    } as Prisma.CustomerUncheckedCreateInput,
    select: { id: true },
  });
  const customerId = created.id;

  // 代表者
  let representativeContactId: number | null = null;
  if (input.representative_name) {
    const rep = await tx.customerContact.create({
      data: { customerId, contactName: input.representative_name, contactIsRepresentative: true },
      select: { id: true },
    });
    representativeContactId = rep.id;
    await tx.customerContactBusinessLink.createMany({
      data: [{ contactId: rep.id, businessId: business.id }],
      skipDuplicates: true,
    });
  }

  // 連絡先
  const contactRoles: Record<string, string> = {};
  for (const c of input.contacts) {
    if (c.role === 'main') {
      await tx.customerContact.updateMany({
        where: { customerId, contactIsPrimary: true },
        data: { contactIsPrimary: false },
      });
    }
    const contact = await tx.customerContact.create({
      data: {
        customerId,
        contactName: c.name,
        contactDepartment: c.department ?? null,
        contactEmail: c.email ?? null,
        contactIsPrimary: c.role === 'main',
      },
      select: { id: true },
    });
    contactRoles[String(contact.id)] = c.role;
    await tx.customerContactBusinessLink.createMany({
      data: [{ contactId: contact.id, businessId: business.id }],
      skipDuplicates: true,
    });
  }

  // 口座
  if (bankComplete) {
    await tx.customerBankAccount.create({
      data: {
        customerId,
        businessId: business.id,
        bankName: input.bank_name as string,
        branchName: input.branch_name as string,
        accountType: input.account_type as string,
        accountNumber: input.account_no as string,
        accountHolder: input.account_holder as string,
      },
    });
  }

  // 事業リンク（MO番号の格納先）
  await tx.customerBusinessLink.create({
    data: {
      customerId,
      businessId: business.id,
      linkStatus: 'active',
      linkCustomData: {
        ...linkData,
        ...(input.form_submitted_at ? { form_submitted_at: input.form_submitted_at } : {}),
        ...(Object.keys(contactRoles).length > 0 ? { contact_roles: contactRoles } : {}),
        ...(representativeContactId !== null
          ? { representative_contact_id: representativeContactId }
          : {}),
      } as Prisma.InputJsonValue,
    },
  });

  return {
    id: customerId,
    created: true,
    dryRun: false,
    filledFields,
    updatedFields: [],
    conflicts: [],
    warnings: ctx.warnings,
  };
}

// ============================================
// 取り込み対象事業の解決（businessCode → id）
// ============================================

export async function resolveImportBusiness(): Promise<{ id: number; businessCode: string } | null> {
  const code = process.env.INTEGRATION_BUSINESS_CODE ?? 'LIGHT';
  // 既存事業コードは小文字運用のものもあるため大文字小文字は区別しない
  return prisma.business.findFirst({
    where: { businessCode: { equals: code, mode: 'insensitive' } },
    select: { id: true, businessCode: true },
  });
}

/** mo_no から顧客を引く（重複チェック用 GET で使用） */
export async function findCustomerIdByMoNo(
  businessId: number,
  moNo: string,
): Promise<number | null> {
  const link = await prisma.customerBusinessLink.findFirst({
    where: { businessId, linkCustomData: { path: ['mo_no'], equals: moNo } },
    select: { customerId: true },
  });
  return link?.customerId ?? null;
}
