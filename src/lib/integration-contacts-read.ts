// ============================================
// 担当者読み出しAPI（GET /api/integrations/customers/{customer_code}/contacts）の整形
// ============================================
//
// ML管理システムのマシン契約マスタ詳細画面が、画面を開くたびにサーバー側から読む。
// ML は担当者を保存しない（営業管理システムが正）ので、ここで返す形が ML の画面の形。
//
// 返さないもの（ML 側の設計書 4-2「持たないもの」と揃える）:
//   口座情報・法人番号・インボイス番号・住所・名刺画像のURL
// 名刺は「あり／なし」の boolean だけ。画像URLを渡すと ML から直接取得できてしまう。

export interface ContactReadRow {
  id: number;
  contactName: string;
  contactDepartment: string | null;
  contactPosition: string | null;
  contactIsRepresentative: boolean;
  contactIsPrimary: boolean;
  contactPhone: string | null;
  contactFax: string | null;
  contactEmail: string | null;
  contactBusinessCardFrontUrl: string | null;
  contactBusinessCardBackUrl: string | null;
  updatedAt: Date;
  businessLinks: Array<{ business: { businessCode: string; businessName: string } }>;
}

/**
 * 担当者1件を ML 向けの1行に整形する。
 *
 * `updated_at` は楽観ロックのトークンとして使う。CustomerContact には version
 * カラムが無いため、ML は編集前に読んだこの値を書き込み時に送り返す。
 * **キーは絶対に落とさない**（未入力は null）。ML が列を固定で埋めるため。
 */
export function buildContactItem(row: ContactReadRow) {
  return {
    id: row.id,
    contact_name: row.contactName,
    department: row.contactDepartment,
    position: row.contactPosition,
    is_representative: row.contactIsRepresentative,
    is_primary: row.contactIsPrimary,
    phone: row.contactPhone,
    fax: row.contactFax,
    email: row.contactEmail,
    // 名刺は有無だけ。画像のURLは返さない
    has_business_card_front: row.contactBusinessCardFrontUrl !== null && row.contactBusinessCardFrontUrl !== '',
    has_business_card_back: row.contactBusinessCardBackUrl !== null && row.contactBusinessCardBackUrl !== '',
    // 担当事業（事業コードとラベル）
    businesses: row.businessLinks.map((bl) => ({
      business_code: bl.business.businessCode,
      business_name: bl.business.businessName,
    })),
    // version カラムが無いので updated_at を楽観ロックのトークンにする
    version: null as number | null,
    updated_at: row.updatedAt.toISOString(),
  };
}

/** レスポンスの item が必ず持つキー（テストと仕様書のドリフト検知に使う） */
export const CONTACT_ITEM_KEYS = [
  'id', 'contact_name', 'department', 'position',
  'is_representative', 'is_primary',
  'phone', 'fax', 'email',
  'has_business_card_front', 'has_business_card_back',
  'businesses', 'version', 'updated_at',
] as const;

/**
 * 絶対に返してはいけないキー。
 * 整形関数を直したときに口座・住所・名刺URLが混ざらないようテストで固定する。
 */
export const CONTACT_FORBIDDEN_KEYS = [
  'account_no', 'account_holder', 'bank_name', 'bank_branch', 'account_type',
  'corporate_no', 'invoice_no', 'address', 'postal_code',
  'business_card_front_url', 'business_card_back_url',
  'contactBusinessCardFrontUrl', 'contactBusinessCardBackUrl',
] as const;
