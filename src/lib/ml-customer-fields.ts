// ============================================
// ML管理システムが読み書きする顧客項目
// ============================================
//
// ML の MO（マシンオーナー）詳細画面が、顧客の画面に出ている項目をそのまま表示・
// 編集する。そのため**口座以外は全部返す／人が直す項目は全部受け付ける**。
//
// 返さないもの:
//   - 口座（銀行名・支店・種別・口座番号・名義）。読み出しは既存の
//     `GET /api/integrations/contracts` と取り込み検算用の数値ID GET だけが返す
//
// 受け付けないもの（それぞれ理由がある）:
//   - `customer_code` … m2 の採番。変えると ML 側の紐づけが切れる
//   - `customer_url` / `updated_at` … m2 が決める値
//   - 計算項目（type: 'formula'） … 入力値ではない
//
// MO番号（`mo_no`）は**トップレベルのキーで**受け付ける。顧客取り込みAPIが
// これをキーに顧客を引くため、変えたら前の番号を履歴に残し、他の顧客との重複を
// 止める（`src/lib/mo-number.ts`）。`custom_fields.mo_no` は 422 にして入口を1つに
// 絞っている（2箇所から違う値が来たときにどちらを採るかを決めずに済ませるため）。
//
// キー名は契約読み出しAPI（`GET /api/integrations/contracts`）と揃える。ML が
// 「読むときの名前」と「書くときの名前」を2つ覚えなくて済むようにするため。
// 電話・FAX・メールが `company_` 接頭辞なのは、担当者の `phone` / `email` と
// 区別するためで、読み出しAPIの `company_phone` に倣っている。

import { z } from 'zod';
import {
  asRecord,
  buildFieldDefs,
  customFieldsPatch,
  DATE_PATTERN,
  normalizeCustomPatch,
  pickDefinedFields,
} from '@/lib/ml-custom-fields';
import { MO_NO_KEY, readMoNo, readMoNoHistory } from '@/lib/mo-number';
import type { EntityFieldDefinition } from '@/types/dynamic-fields';

export {
  assertCustomFieldsWritable,
  type MlCustomFieldDef,
} from '@/lib/ml-custom-fields';

export const CUSTOMER_TYPES = ['法人', '個人事業主', '個人', '確認中', '未設定'] as const;

// ============================================
// 値の形
// ============================================

/** 任意の文字列（空文字は「空にする」の意味。保存時に null へ寄せる） */
const text = (max: number, label: string) =>
  z.string().max(max, `${label}は${max}文字以内で指定してください`).nullable().optional();

/** 長さ上限の無い自由記述（住所・備考） */
const longText = z.string().nullable().optional();

/** 形式チェックつきの文字列。空文字・null は「空にする」 */
function formatted(max: number, label: string, check: (v: string) => boolean, message: string) {
  return z
    .string()
    .max(max, `${label}は${max}文字以内で指定してください`)
    .nullable()
    .optional()
    .refine((v) => v == null || v === '' || check(v), { message });
}

const isEmail = (v: string) => z.string().email().safeParse(v).success;
const isUrl = (v: string) => z.string().url().safeParse(v).success;

const dateOnly = z
  .string()
  .nullable()
  .optional()
  .refine((v) => v == null || v === '' || DATE_PATTERN.test(v), {
    message: '日付は YYYY-MM-DD 形式で指定してください',
  });

export const mlCustomerPatchSchema = z
  .object({
    /** 社名（m2 の customer_name） */
    company_name: z.string().min(1, '社名は必須です').max(200, '社名は200文字以内で指定してください').optional(),
    /** 呼称（御中・様 など） */
    customer_salutation: text(100, '呼称'),
    /** 法人／個人事業主／個人 */
    customer_type: z.enum(CUSTOMER_TYPES).optional(),
    /** 郵便番号 */
    postal_code: text(10, '郵便番号'),
    /** 住所 */
    address: longText,
    /** 会社の電話番号 */
    company_phone: text(20, '電話番号'),
    /** 会社のFAX番号 */
    company_fax: text(20, 'FAX番号'),
    /** 会社のメールアドレス */
    company_email: formatted(255, 'メールアドレス', isEmail, 'メールアドレスの形式が正しくありません'),
    /** ホームページ */
    website: formatted(500, 'ホームページ', isUrl, 'ホームページは http(s):// から始まるURLで指定してください'),
    /** 法人番号（「なし」「申請中」も入るため自由記述） */
    corporate_no: text(100, '法人番号'),
    /** インボイス番号（同じく自由記述） */
    invoice_no: text(100, 'インボイス番号'),
    /** 資本金（円） */
    capital: z
      .number()
      .int('資本金は整数で指定してください')
      .min(0, '資本金は0以上で指定してください')
      .nullable()
      .optional(),
    /** 設立日 */
    established_on: dateOnly,
    /** 決算月（1-12） */
    fiscal_month: z
      .number()
      .int('決算月は整数で指定してください')
      .min(1, '決算月は1〜12で指定してください')
      .max(12, '決算月は1〜12で指定してください')
      .nullable()
      .optional(),
    /**
     * 業種。**名前**で指定する（m2 の業種マスタに登録されている名前）。
     * 読み出しレスポンスの `industry_options` が選べる名前の一覧。
     */
    industry: text(100, '業種'),
    /** 顧客フォルダのURL */
    folder_url: formatted(500, '顧客フォルダ', isUrl, '顧客フォルダは http(s):// から始まるURLで指定してください'),
    /** 備考 */
    customer_notes: longText,
    /**
     * MO番号。変えると前の番号が `mo_no_previous` に残り、取り込みAPIは前の番号でも
     * 顧客を引ける。他の顧客の今／前の番号と同じなら 422。
     */
    mo_no: text(50, 'MO番号'),
    /** ライト事業の事業別カスタム項目（customer_business_links.link_custom_data） */
    custom_fields: customFieldsPatch.optional(),
    /** 全事業共通のカスタム項目（customers.customer_custom_data） */
    global_custom_fields: customFieldsPatch.optional(),
    /** 楽観ロック。編集前に読んだ顧客の version */
    version: z.number().int().min(1),
  })
  // 知らないキーは黙って捨てずに 422。ML 側のタイプミスを気づけるようにする
  .strict();

export type MlCustomerPatchInput = z.infer<typeof mlCustomerPatchSchema>;

/** ML のキー → m2 のカラム名 */
const COLUMN_MAP = {
  company_name: 'customerName',
  customer_salutation: 'customerSalutation',
  customer_type: 'customerType',
  postal_code: 'customerPostalCode',
  address: 'customerAddress',
  company_phone: 'customerPhone',
  company_fax: 'customerFax',
  company_email: 'customerEmail',
  website: 'customerWebsite',
  corporate_no: 'customerCorporateNumber',
  invoice_no: 'customerInvoiceNumber',
  capital: 'customerCapital',
  established_on: 'customerEstablishedDate',
  fiscal_month: 'customerFiscalMonth',
  folder_url: 'customerFolderUrl',
  customer_notes: 'customerNotes',
} as const;

/** ML が書き戻せるキーの一覧（仕様書とのドリフト検知に使う） */
export const ML_CUSTOMER_WRITABLE_KEYS = [
  ...Object.keys(COLUMN_MAP),
  'industry',
  'mo_no',
  'custom_fields',
  'global_custom_fields',
] as const;

export interface ToCustomerUpdateBodyOptions {
  /** ライト事業のID。`custom_fields` を書くとき中間テーブルの特定に必要 */
  businessId: number;
  /**
   * `industry`（名前）を解決した業種ID。
   * `industry` が送られていないときは undefined を渡す（カラムに触らない）。
   */
  industryId?: number | null;
}

/**
 * ML のリクエストを共通更新処理（`applyCustomerUpdate`）のボディへ変換する。
 *
 * 空文字は null へ寄せる（m2 側は未入力を null で持つ。'' のまま渡すと
 * 「空文字という値」が入り、画面の未入力判定と食い違う）。
 */
export function toCustomerUpdateBody(
  input: MlCustomerPatchInput,
  options: ToCustomerUpdateBodyOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = { version: input.version };

  for (const [mlKey, column] of Object.entries(COLUMN_MAP)) {
    const value = input[mlKey as keyof MlCustomerPatchInput];
    if (value === undefined) continue;
    body[column] = value === '' ? null : value;
  }

  if (input.industry !== undefined) body.industryId = options.industryId ?? null;

  // カスタムデータは共通側がマージ更新する（送られたキーだけ差し替わる）
  if (input.custom_fields !== undefined || input.mo_no !== undefined) {
    body.linkCustomData = {
      ...normalizeCustomPatch(input.custom_fields ?? {}),
      // MO番号はトップレベルで受けるが、保存先は事業別カスタムデータ。
      // 前の番号の履歴づけと重複チェックは applyCustomerUpdate 側で行う
      ...(input.mo_no !== undefined ? { [MO_NO_KEY]: input.mo_no === '' ? null : input.mo_no } : {}),
    };
    body.businessId = options.businessId;
  }
  if (input.global_custom_fields !== undefined) {
    body.customerCustomData = normalizeCustomPatch(input.global_custom_fields);
  }

  return body;
}

// ============================================
// レスポンスの整形
// ============================================

export interface MlCustomerItemSource {
  id: number;
  customerCode: string;
  customerName: string;
  customerSalutation: string | null;
  customerType: string;
  customerPostalCode: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerFax: string | null;
  customerEmail: string | null;
  customerWebsite: string | null;
  customerCorporateNumber: string | null;
  customerInvoiceNumber: string | null;
  customerCapital: bigint | null;
  customerEstablishedDate: Date | null;
  customerFiscalMonth: number | null;
  customerFolderUrl: string | null;
  customerNotes: string | null;
  customerCustomData: unknown;
  version: number;
  updatedAt: Date;
  industry: { industryName: string } | null;
  /** ライト事業のリンク（0件なら事業別項目は全部 null になる） */
  businessLinks: Array<{ linkCustomData: unknown }>;
}

export interface BuildMlCustomerItemOptions {
  customerUrl: string;
  /** 事業別カスタム項目の定義（businesses.business_config.customerFields） */
  linkFieldDefs: EntityFieldDefinition[];
  /** 全事業共通のカスタム項目の定義（system_settings.globalCustomerFields） */
  globalFieldDefs: EntityFieldDefinition[];
  /** 業種に指定できる名前の一覧（有効な業種マスタ） */
  industryOptions: string[];
}

/**
 * ML へ返す顧客1件。
 *
 * 読み出し（GET）・PATCH のレスポンス・409 の `current` で同じ形を使う。
 * **キーは落とさない**（未入力は null）。ML が画面の欄を固定で埋めるため。
 */
export function buildMlCustomerItem(
  row: MlCustomerItemSource,
  options: BuildMlCustomerItemOptions,
) {
  const linkData = asRecord(row.businessLinks[0]?.linkCustomData);
  const globalData = asRecord(row.customerCustomData);

  return {
    customer_code: row.customerCode,
    customer_url: options.customerUrl,
    /** MO番号（事業別カスタム項目。`custom_fields` にも同じ値が入る） */
    mo_no: readMoNo(linkData),
    /** 前のMO番号（古い順）。取り込みAPIはこの番号でも顧客を引ける */
    mo_no_previous: readMoNoHistory(linkData),

    company_name: row.customerName,
    customer_salutation: row.customerSalutation,
    customer_type: row.customerType,

    postal_code: row.customerPostalCode,
    address: row.customerAddress,
    company_phone: row.customerPhone,
    company_fax: row.customerFax,
    company_email: row.customerEmail,
    website: row.customerWebsite,

    corporate_no: row.customerCorporateNumber,
    invoice_no: row.customerInvoiceNumber,
    capital: row.customerCapital !== null ? Number(row.customerCapital) : null,
    established_on: row.customerEstablishedDate
      ? row.customerEstablishedDate.toISOString().slice(0, 10)
      : null,
    fiscal_month: row.customerFiscalMonth,
    industry: row.industry?.industryName ?? null,
    industry_options: options.industryOptions,
    folder_url: row.customerFolderUrl,
    customer_notes: row.customerNotes,

    custom_fields: pickDefinedFields(options.linkFieldDefs, linkData),
    custom_field_defs: buildFieldDefs(options.linkFieldDefs),
    global_custom_fields: pickDefinedFields(options.globalFieldDefs, globalData),
    global_custom_field_defs: buildFieldDefs(options.globalFieldDefs),

    version: row.version,
    updated_at: row.updatedAt.toISOString(),
  };
}

/** レスポンスが必ず持つキー（テストと仕様書のドリフト検知に使う） */
export const ML_CUSTOMER_ITEM_KEYS = [
  'customer_code', 'customer_url', 'mo_no', 'mo_no_previous',
  'company_name', 'customer_salutation', 'customer_type',
  'postal_code', 'address', 'company_phone', 'company_fax', 'company_email', 'website',
  'corporate_no', 'invoice_no', 'capital', 'established_on', 'fiscal_month',
  'industry', 'industry_options', 'folder_url', 'customer_notes',
  'custom_fields', 'custom_field_defs',
  'global_custom_fields', 'global_custom_field_defs',
  'version', 'updated_at',
] as const;

/**
 * 絶対に返してはいけないキー。
 * 整形関数を直したときに口座が混ざらないようテストで固定する。
 */
export const ML_CUSTOMER_FORBIDDEN_KEYS = [
  'bank_name', 'bank_branch', 'branch_name', 'account_type', 'account_no', 'account_holder',
  'bankAccounts', 'bank_account_scope',
] as const;
