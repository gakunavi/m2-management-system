// ============================================
// ML管理システムが書き戻せる案件項目
// ============================================
//
// ML 側が写しで持っている項目（設計書 `docs/phase1-spec.md` 4-2 の
// `ml.m2_projects` / `ml.m2_project_details`）と、既存の契約読み出しAPI
// （`GET /api/integrations/contracts`）が返している項目を突き合わせて決めた集合。
//
// 読み出しAPIと同じ snake_case のキー名を使う。ML が「読むときの名前」と
// 「書くときの名前」を2つ覚えなくて済むようにするため。
//
// 含めないもの（それぞれ理由がある）:
//   - `plan`         … ML 側が `needs`（A_節税 → A）から導く値。m2 に項目が無い
//   - `mo_no`        … 顧客の事業別カスタム項目。顧客の取り込みAPIが正
//   - `company_name` / `customer_type` / `customer_code` … 顧客の項目（顧客PATCHで直す）
//   - `status_label` … 表示用。コードから引くもので入力値ではない
//   - `assigned_user_name` … 社内の割り当て。m2 の画面で決める（読むだけ）
//   - `status_changed_at` … m2 がステータス変更時に自分で打つ
//   - 口座・法人番号・インボイス番号・住所・連絡先 … ML は保存しない（4-2「持たないもの」）
//   - `project_notes` / `thank_you_recipient` / `gratitude_certificate_name`
//                    … 読み出しAPIは返すが ML の表に無い（写しを持っていない項目は直せない）

import { z } from 'zod';
import { ApiError } from '@/lib/error-handler';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

/** 'YYYY-MM-DD' か null */
const dateOnly = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, '日付は YYYY-MM-DD 形式で指定してください')
  .nullable()
  .optional();

const nonNegativeInt = (label: string) =>
  z.number().int(`${label}は整数で指定してください`).min(0, `${label}は0以上で指定してください`).nullable().optional();

export const mlProjectPatchSchema = z
  .object({
    /** 営業ステータスの**コード**（informal_approval / purchased など）。ラベルは受け付けない */
    status_code: z.string().min(1).optional(),
    /** ニーズ（A_節税 など生の値）。ML の plan はこれから導く */
    needs: z.string().max(200).nullable().optional(),
    /** 台数 */
    unit_count: nonNegativeInt('台数'),
    /** 購入単価（税抜） */
    unit_price: nonNegativeInt('購入単価'),
    /** 購入金額（税抜）。事業設定で数式項目になっている場合は 422（下記 assertNoFormulaFields） */
    purchase_amount: nonNegativeInt('購入金額'),
    /** 売買契約日 */
    sales_contract_date: dateOnly,
    /** 運用契約日 */
    operation_contract_date: dateOnly,
    /** 着金日 */
    payment_received_date: dateOnly,
    /** 中企庁申請者 */
    sme_agency_applicant: z.string().max(200).nullable().optional(),
    /** 楽観ロック。編集前に読んだ案件の version */
    version: z.number().int().min(1),
  })
  // 知らないキーは黙って捨てずに 422。ML 側のタイプミスを気づけるようにする
  .strict();

export type MlProjectPatchInput = z.infer<typeof mlProjectPatchSchema>;

/** ML のキー → `project_custom_data` のキー */
const CUSTOM_DATA_KEY_MAP: Record<string, string> = {
  needs: 'needs',
  unit_count: 'unit_count',
  // 読み出しAPIは unit_price という名前で返しているが、保存先のキーは purchase_unit_price
  unit_price: 'purchase_unit_price',
  purchase_amount: 'purchase_amount',
  sales_contract_date: 'sales_contract_date',
  operation_contract_date: 'operation_contract_date',
  payment_received_date: 'payment_received_date',
  sme_agency_applicant: 'sme_agency_applicant',
};

/** ML が書き戻せるキーの一覧（仕様書とのドリフト検知に使う） */
export const ML_PROJECT_WRITABLE_KEYS = [
  'status_code',
  ...Object.keys(CUSTOM_DATA_KEY_MAP),
] as const;

/**
 * 数式項目への書き込みを弾く。
 *
 * 購入金額は事業設定で「購入単価 × 台数」の数式項目になっている（ライト事業）。
 * 共通の更新処理は保存前に数式を再計算して上書きするため、ML が送った値は
 * 黙って消える。黙って消えるくらいなら 422 で理由を返す。
 */
export function assertNoFormulaFields(
  input: MlProjectPatchInput,
  projectFields: ProjectFieldDefinition[],
): void {
  const formulaKeys = new Set(
    projectFields.filter((f) => f.type === 'formula').map((f) => f.key),
  );
  const offending: Array<{ field: string; message: string }> = [];

  for (const [mlKey, dataKey] of Object.entries(CUSTOM_DATA_KEY_MAP)) {
    if (input[mlKey as keyof MlProjectPatchInput] === undefined) continue;
    if (!formulaKeys.has(dataKey)) continue;
    offending.push({
      field: mlKey,
      message: `${mlKey} は営業管理システム側で他の項目から計算される項目のため更新できません（計算元の項目を更新してください）`,
    });
  }

  if (offending.length > 0) {
    throw ApiError.badRequest('計算項目は更新できません', offending);
  }
}

export interface ProjectUpdateBody {
  version: number;
  projectSalesStatus?: string;
  projectCustomData?: Record<string, unknown>;
}

/**
 * ML のリクエストを共通更新処理（`applyProjectUpdate`）のボディへ変換する。
 *
 * `projectCustomData` は共通側がマージ更新するので、送られたキーだけを入れる。
 */
export function toProjectUpdateBody(input: MlProjectPatchInput): ProjectUpdateBody {
  const body: ProjectUpdateBody = { version: input.version };

  if (input.status_code !== undefined) body.projectSalesStatus = input.status_code;

  const customData: Record<string, unknown> = {};
  for (const [mlKey, dataKey] of Object.entries(CUSTOM_DATA_KEY_MAP)) {
    const value = input[mlKey as keyof MlProjectPatchInput];
    if (value === undefined) continue;
    // null は「空にする」。空文字ではなく null で保存する（読み出しAPIが null を返す形に合わせる）
    customData[dataKey] = value;
  }
  if (Object.keys(customData).length > 0) body.projectCustomData = customData;

  return body;
}

export interface MlProjectItemSource {
  projectNo: string;
  projectSalesStatus: string;
  projectStatusChangedAt: Date | null;
  /** 営業担当の名前。契約読み出しAPIの assigned_user_name と同じ値 */
  projectAssignedUserName: string | null;
  projectCustomData: unknown;
  version: number;
  customer: { customerCode: string };
}

/** カスタムデータから素の値を取る。未入力・キー無しは null */
function customValue(data: Record<string, unknown>, key: string): unknown {
  const v = data[key];
  return v === undefined || v === '' ? null : v;
}

/**
 * ML へ返す案件1件。
 *
 * PATCH のレスポンスと 409 の `current` で同じ形を使う。`version` を必ず含める
 * （ML は次の編集でこれを送り返す）。
 */
export function buildMlProjectItem(
  row: MlProjectItemSource,
  options: { statusLabel: string | null; projectUrl: string },
) {
  const data = (row.projectCustomData ?? {}) as Record<string, unknown>;
  return {
    project_no: row.projectNo,
    project_url: options.projectUrl,
    customer_code: row.customer.customerCode,
    status_code: row.projectSalesStatus,
    status_label: options.statusLabel,
    status_changed_at: row.projectStatusChangedAt ? row.projectStatusChangedAt.toISOString() : null,
    // 営業担当（m2 側で変わると project.updated を通知する）。書き戻しは受け付けない
    assigned_user_name: row.projectAssignedUserName,
    needs: customValue(data, 'needs'),
    unit_count: customValue(data, 'unit_count'),
    unit_price: customValue(data, 'purchase_unit_price'),
    purchase_amount: customValue(data, 'purchase_amount'),
    sales_contract_date: customValue(data, 'sales_contract_date'),
    operation_contract_date: customValue(data, 'operation_contract_date'),
    payment_received_date: customValue(data, 'payment_received_date'),
    sme_agency_applicant: customValue(data, 'sme_agency_applicant'),
    version: row.version,
  };
}

/** レスポンスが必ず持つキー（テストと仕様書のドリフト検知に使う） */
export const ML_PROJECT_ITEM_KEYS = [
  'project_no', 'project_url', 'customer_code',
  'status_code', 'status_label', 'status_changed_at', 'assigned_user_name',
  'needs', 'unit_count', 'unit_price', 'purchase_amount',
  'sales_contract_date', 'operation_contract_date', 'payment_received_date',
  'sme_agency_applicant', 'version',
] as const;
