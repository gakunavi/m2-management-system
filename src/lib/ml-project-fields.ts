// ============================================
// ML管理システムが書き戻せる案件項目
// ============================================
//
// **ライト事業の案件は、営業管理システムと ML のどちらからでも直せて、いつも同じ値に
// する**（2026-11-06 石井さん）。そのため事業設定のカスタム項目
// （`businesses.business_config.projectFields`）は**計算項目を除いて全部**読めるし書ける。
// 事業マスタに項目を足せば ML の口にも自動で出る（定義ごと返しているので ML 側の
// コードを直さなくてよい）。
//
// 2つの入口がある:
//   - **トップレベルの専用キー**（`needs` / `unit_count` / `unit_price` など）…
//     契約読み出しAPI（`GET /api/integrations/contracts`）と同じ snake_case の名前。
//     ML が「読むときの名前」と「書くときの名前」を2つ覚えなくて済むようにするため
//   - **`custom_fields`**（キー → 値）… 上に専用キーの無い項目すべて。
//     工業会ステータス・中企庁ステータス・各リースのステータスなどがこちら
//
// 専用キーのある項目を `custom_fields` から送ると 422（2経路から違う値が来たときに
// どちらを採るかを決めずに済ませるため）。
//
// 含めないもの（それぞれ理由がある）:
//   - 計算項目（`type: 'formula'`。購入金額＝購入単価×台数） … 入力値ではない。
//     共通の更新処理が保存前に再計算するので、受け付けると黙って消える
//   - `plan`         … ML 側が `needs`（A_節税 → A）から導く値。m2 に項目が無い
//   - `mo_no` / `company_name` / `customer_type` / `customer_code` … 顧客の項目
//     （顧客の PATCH で直す）
//   - `status_label` … 表示用。コードから引くもので入力値ではない
//   - `status_changed_at` … m2 がステータス変更時に自分で打つ
//   - `assigned_user_name` … 社内ユーザーへの割り当て。名前だけ書き換えると
//     `project_assigned_user_id`（通知の宛先に使う FK）と食い違うため、読むだけ。
//     開けるなら m2 のユーザー一覧を返す口と id での指定が先に必要
//   - 報酬・自社取り分・収益確定日・解約日・凍結スナップショット … 社内の会計。
//     権限（admin 限定の項目を含む）と発行済み明細との整合があるため ML には開けない
//   - 口座・法人番号・インボイス番号・住所・連絡先 … ML は保存しない

import { z } from 'zod';
import { ApiError } from '@/lib/error-handler';
import {
  buildFieldDefs,
  customFieldsPatch,
  normalizeCustomPatch,
  pickDefinedFields,
} from '@/lib/ml-custom-fields';
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
    /**
     * 上に専用キーの無いカスタム項目（工業会ステータス・中企庁ステータス・
     * 各リースのステータス・初回商談日 など）。キーは事業設定の項目キーそのまま。
     * 定義と突き合わせて検査する（未定義キー・計算項目・型違い・選択肢違反は 422）。
     */
    custom_fields: customFieldsPatch.optional(),
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
  'custom_fields',
] as const;

/**
 * `custom_fields` から書き込めないキー → 返すメッセージ。
 *
 * トップレベルに専用キーがある項目は、そちらで送らせる（入口を1つに絞る）。
 */
export function projectCustomFieldsReadOnlyKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [mlKey, dataKey] of Object.entries(CUSTOM_DATA_KEY_MAP)) {
    out[dataKey] = `この項目は custom_fields ではなくトップレベルの ${mlKey} で指定してください`;
  }
  return out;
}

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
  // 専用キーの無い項目。キーが重なることはない（重なったら上で 422 にしている）
  if (input.custom_fields !== undefined) {
    Object.assign(customData, normalizeCustomPatch(input.custom_fields));
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
  options: {
    statusLabel: string | null;
    projectUrl: string;
    /** 事業設定のカスタム項目定義（businesses.business_config.projectFields） */
    projectFieldDefs: ProjectFieldDefinition[];
  },
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

    // 事業設定のカスタム項目を全部（上の専用キーと同じ値も含む）。
    // 定義に無いキーは入らない。未入力は null でキーは落とさない
    custom_fields: pickDefinedFields(options.projectFieldDefs, data),
    // ML が入力欄を組むための定義（名前・種類・選べる値・計算項目か・並び順）
    project_custom_field_defs: buildFieldDefs(options.projectFieldDefs),

    version: row.version,
  };
}

/** レスポンスが必ず持つキー（テストと仕様書のドリフト検知に使う） */
export const ML_PROJECT_ITEM_KEYS = [
  'project_no', 'project_url', 'customer_code',
  'status_code', 'status_label', 'status_changed_at', 'assigned_user_name',
  'needs', 'unit_count', 'unit_price', 'purchase_amount',
  'sales_contract_date', 'operation_contract_date', 'payment_received_date',
  'sme_agency_applicant',
  'custom_fields', 'project_custom_field_defs',
  'version',
] as const;
