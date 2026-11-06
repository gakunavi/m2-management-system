// ============================================
// ML向け顧客1件の読み出し（DBアクセス）
// ============================================
//
// 読み出しAPI（`GET /api/integrations/customers/by-code/{customer_code}`）、
// PATCH のレスポンス、409 の `current` で同じ形を返すため1箇所にまとめる。
// 形が揃っていないと、ML は「読んだときと PATCH の返りで欄が違う」状態になり、
// 行全体を置き換える実装だと項目が消える。
//
// ⚠️ レスポンス本文はログに出さないこと（社名・住所・連絡先を含む）。

import type { PrismaClient } from '@prisma/client';
import { ApiError } from '@/lib/error-handler';
import { customerAdminUrl } from '@/lib/integration-url';
import { buildMlCustomerItem } from '@/lib/ml-customer-fields';
import { MO_NO_KEY } from '@/lib/mo-number';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';

/** グローバルカスタム項目の定義が入っている system_settings のキー */
const GLOBAL_CUSTOMER_FIELDS_KEY = 'globalCustomerFields';

const CUSTOMER_SELECT = {
  id: true,
  customerCode: true,
  customerName: true,
  customerSalutation: true,
  customerType: true,
  customerPostalCode: true,
  customerAddress: true,
  customerPhone: true,
  customerFax: true,
  customerEmail: true,
  customerWebsite: true,
  customerCorporateNumber: true,
  customerInvoiceNumber: true,
  customerCapital: true,
  customerEstablishedDate: true,
  customerFiscalMonth: true,
  customerFolderUrl: true,
  customerNotes: true,
  customerCustomData: true,
  version: true,
  updatedAt: true,
  industry: { select: { industryName: true } },
} as const;

export interface CustomerFieldDefinitions {
  /** 事業別（businesses.business_config.customerFields） */
  link: EntityFieldDefinition[];
  /** 全事業共通（system_settings.globalCustomerFields） */
  global: EntityFieldDefinition[];
}

/** 顧客のカスタム項目の定義を読む（事業別＋グローバル） */
export async function loadCustomerFieldDefinitions(
  prisma: PrismaClient,
  businessId: number,
): Promise<CustomerFieldDefinitions> {
  const [business, setting] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { businessConfig: true } }),
    prisma.systemSetting.findUnique({ where: { settingKey: GLOBAL_CUSTOMER_FIELDS_KEY } }),
  ]);

  const link =
    (business?.businessConfig as { customerFields?: EntityFieldDefinition[] } | null)
      ?.customerFields ?? [];

  let global: EntityFieldDefinition[] = [];
  if (setting?.settingValue) {
    try {
      const parsed = JSON.parse(setting.settingValue);
      if (Array.isArray(parsed)) global = parsed as EntityFieldDefinition[];
    } catch {
      // 壊れた JSON は「定義なし」扱い（画面側も同じフォールバック）
    }
  }

  return { link, global };
}

/** 業種に選べる名前の一覧（有効なものを表示順で） */
export async function loadIndustryOptions(prisma: PrismaClient): Promise<string[]> {
  const industries = await prisma.industry.findMany({
    where: { isActive: true },
    select: { industryName: true },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  });
  return industries.map((i) => i.industryName);
}

/**
 * 業種名を業種IDへ解決する。
 *
 * ML は業種を**名前**で送る（m2 の内部IDを ML に覚えさせない）。
 * 登録されていない名前は 422 で、選べる名前を添えて返す。
 */
export async function resolveIndustryId(
  prisma: PrismaClient,
  name: string | null | undefined,
): Promise<number | null> {
  if (name == null || name === '') return null;

  const industry = await prisma.industry.findFirst({
    where: { industryName: name, isActive: true },
    select: { id: true },
  });
  if (industry) return industry.id;

  const options = await loadIndustryOptions(prisma);
  throw ApiError.badRequest('業種の値が不正です', [
    {
      field: 'industry',
      message: `業種「${name}」は営業管理システムに登録されていません（選べる値: ${options.join(' / ')}）`,
    },
  ]);
}

/**
 * `custom_fields` から書き込めないキー → 返すメッセージ。
 * MO番号はトップレベルの `mo_no` で受けるため、ここからは受け付けない（入口を1つに絞る）。
 */
export const CUSTOMER_READ_ONLY_LINK_KEYS: Record<string, string> = {
  [MO_NO_KEY]: 'MO番号は custom_fields ではなくトップレベルの mo_no で指定してください',
};

export interface ReadMlCustomerOptions {
  customerId: number;
  businessId: number;
}

/**
 * 顧客1件を ML 向けの形で読む。見つからなければ null。
 *
 * `businessLinks` はライト事業の分だけに絞る（他事業の事業別項目は ML に関係ない）。
 */
export async function readMlCustomer(
  prisma: PrismaClient,
  options: ReadMlCustomerOptions,
) {
  const [customer, defs, industryOptions] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: options.customerId },
      select: {
        ...CUSTOMER_SELECT,
        businessLinks: {
          where: { businessId: options.businessId },
          select: { linkCustomData: true },
        },
      },
    }),
    loadCustomerFieldDefinitions(prisma, options.businessId),
    loadIndustryOptions(prisma),
  ]);

  if (!customer) return null;

  return buildMlCustomerItem(customer, {
    customerUrl: customerAdminUrl(customer.id),
    linkFieldDefs: defs.link,
    globalFieldDefs: defs.global,
    industryOptions,
  });
}
