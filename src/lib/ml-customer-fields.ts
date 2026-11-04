// ============================================
// ML管理システムが書き戻せる顧客項目
// ============================================
//
// ML が顧客について持っているのは `ml.m2_project_details` の `company_name` と
// `customer_type` だけ（設計書 `docs/phase1-spec.md` 4-2。住所・法人番号・
// インボイス番号・連絡先は「持たないもの」として取り込み時に捨てている）。
// 写しを持っていない項目は ML の画面に出ていないので、直す口も開けない。
//
// キー名は契約読み出しAPI（`GET /api/integrations/contracts`）と揃える。

import { z } from 'zod';

export const mlCustomerPatchSchema = z
  .object({
    /** 社名（m2 の customer_name） */
    company_name: z.string().min(1, '社名は必須です').max(200).optional(),
    /** 法人／個人事業主／個人（m2 の customer_type） */
    customer_type: z.enum(['法人', '個人事業主', '個人', '確認中', '未設定']).optional(),
    /** 楽観ロック。編集前に読んだ顧客の version */
    version: z.number().int().min(1),
  })
  // 知らないキーは黙って捨てずに 422。ML 側のタイプミスを気づけるようにする
  .strict();

export type MlCustomerPatchInput = z.infer<typeof mlCustomerPatchSchema>;

/** ML が書き戻せるキーの一覧（仕様書とのドリフト検知に使う） */
export const ML_CUSTOMER_WRITABLE_KEYS = ['company_name', 'customer_type'] as const;

export interface CustomerUpdateBody {
  version: number;
  customerName?: string;
  customerType?: string;
}

/** ML のリクエストを共通更新処理（`applyCustomerUpdate`）のボディへ変換する */
export function toCustomerUpdateBody(input: MlCustomerPatchInput): CustomerUpdateBody {
  return {
    version: input.version,
    ...(input.company_name !== undefined ? { customerName: input.company_name } : {}),
    ...(input.customer_type !== undefined ? { customerType: input.customer_type } : {}),
  };
}

export interface MlCustomerItemSource {
  customerCode: string;
  customerName: string;
  customerType: string;
  version: number;
}

/**
 * ML へ返す顧客1件。
 *
 * PATCH のレスポンスと 409 の `current` で同じ形を使う。`version` を必ず含める。
 * 住所・法人番号・インボイス番号・口座は返さない。
 */
export function buildMlCustomerItem(
  row: MlCustomerItemSource,
  options: { customerUrl: string },
) {
  return {
    customer_code: row.customerCode,
    customer_url: options.customerUrl,
    company_name: row.customerName,
    customer_type: row.customerType,
    version: row.version,
  };
}

/** レスポンスが必ず持つキー（テストと仕様書のドリフト検知に使う） */
export const ML_CUSTOMER_ITEM_KEYS = [
  'customer_code', 'customer_url', 'company_name', 'customer_type', 'version',
] as const;
