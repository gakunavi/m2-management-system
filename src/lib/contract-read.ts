// ============================================
// 契約読み出しAPI（GET /api/integrations/contracts）の純粋ロジック
// ============================================
//
// DB アクセスを含まない部分（クエリ検証・カーソル・1件分の整形）をここに置く。
// 列の欠落や値の勝手な整形は呼び出し側（スプレッドシート転記）で気づけないため、
// キー集合と「生の値をそのまま返す」方針をテストで固定する。

/** クエリの上限。Google スプレッドシート転記では100件ずつ取る想定 */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface ContractCursor {
  /** project_status_changed_at。null の行は昇順で最後に来る */
  t: Date | null;
  id: number;
}

export interface ContractQuery {
  status: string | null;
  updatedSince: Date | null;
  moNo: string | null;
  limit: number;
  cursor: ContractCursor | null;
}

export type ValidationError = { field: string; message: string };

export type ParseResult =
  | { ok: true; value: ContractQuery }
  | { ok: false; errors: ValidationError[] };

/** カーソルは中身を約束しない不透明な文字列として扱う */
export function encodeCursor(cursor: ContractCursor): string {
  const raw = JSON.stringify({ t: cursor.t ? cursor.t.toISOString() : null, id: cursor.id });
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeCursor(value: string): ContractCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed?.id !== 'number') return null;
    if (parsed.t === null) return { t: null, id: parsed.id };
    if (typeof parsed.t !== 'string') return null;
    const t = new Date(parsed.t);
    if (Number.isNaN(t.getTime())) return null;
    return { t, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * クエリパラメータを検証する。
 *
 * status は**コード**だけを受け付ける（ラベルは 422）。ラベルは表示用の文字列で
 * 事業マスタから変更できてしまうため、キーにすると呼び出し側が静かに壊れる。
 */
export function parseContractQuery(
  params: URLSearchParams,
  statusDefs: Array<{ statusCode: string; statusLabel: string }>,
): ParseResult {
  const errors: ValidationError[] = [];

  // --- status ---
  const statusRaw = params.get('status')?.trim() || null;
  let status: string | null = null;
  if (statusRaw) {
    const byCode = statusDefs.find((s) => s.statusCode === statusRaw);
    if (byCode) {
      status = byCode.statusCode;
    } else {
      const byLabel = statusDefs.find((s) => s.statusLabel === statusRaw);
      const codes = statusDefs.map((s) => s.statusCode).join(', ');
      errors.push({
        field: 'status',
        message: byLabel
          ? `status はステータスコードで指定してください（"${statusRaw}" はラベルです。コードは "${byLabel.statusCode}"）。指定可能: ${codes}`
          : `status "${statusRaw}" は対象事業のステータスコードにありません。指定可能: ${codes}`,
      });
    }
  }

  // --- updated_since ---
  const sinceRaw = params.get('updated_since')?.trim() || null;
  let updatedSince: Date | null = null;
  if (sinceRaw) {
    const parsed = new Date(sinceRaw);
    // "2026-09-11" のような日付だけの指定も Date は通すが、区切り文字を持たない
    // 文字列（"abc"）や不正な日付は NaN になる
    if (Number.isNaN(parsed.getTime())) {
      errors.push({
        field: 'updated_since',
        message: 'updated_since は ISO 8601 形式で指定してください（例: 2026-09-11T00:00:00Z）',
      });
    } else {
      updatedSince = parsed;
    }
  }

  // --- mo_no ---
  const moNo = params.get('mo_no')?.trim() || null;

  // --- limit ---
  const limitRaw = params.get('limit')?.trim() || null;
  let limit = DEFAULT_LIMIT;
  if (limitRaw) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      errors.push({ field: 'limit', message: `limit は 1〜${MAX_LIMIT} の整数で指定してください` });
    } else {
      limit = n;
    }
  }

  // --- cursor ---
  const cursorRaw = params.get('cursor')?.trim() || null;
  let cursor: ContractCursor | null = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      errors.push({ field: 'cursor', message: 'cursor が不正です（前回のレスポンスの next_cursor をそのまま渡してください）' });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { status, updatedSince, moNo, limit, cursor } };
}

// ============================================
// 1件分の整形
// ============================================

export interface ContractContact {
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactIsRepresentative: boolean;
  contactIsPrimary: boolean;
}

export interface ContractBankAccount {
  id: number;
  businessId: number | null;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}

export interface ContractProjectRow {
  id: number;
  projectNo: string;
  projectSalesStatus: string;
  projectStatusChangedAt: Date | null;
  projectAssignedUserName: string | null;
  projectNotes: string | null;
  projectCustomData: unknown;
  customer: {
    id: number;
    customerCode: string;
    customerName: string;
    customerSalutation: string | null;
    customerType: string;
    customerPostalCode: string | null;
    customerAddress: string | null;
    customerPhone: string | null;
    customerCorporateNumber: string | null;
    customerInvoiceNumber: string | null;
    customerFiscalMonth: number | null;
    businessLinks: Array<{ linkCustomData: unknown }>;
    contacts: ContractContact[];
    bankAccounts: ContractBankAccount[];
  };
}

export interface BuildContractItemOptions {
  businessId: number;
  statusLabel: string;
  projectUrl: string;
  customerUrl: string;
  pickBankAccount: (accounts: ContractBankAccount[], businessId: number) => ContractBankAccount | null;
}

/** 案件カスタムデータから素の値を取る。未入力・キー無しは null */
function customValue(data: Record<string, unknown>, key: string): unknown {
  const v = data[key];
  return v === undefined || v === '' ? null : v;
}

/**
 * 案件1件を転記用の1行に整形する。
 *
 * 値は一切正規化しない（ニーズの "A_節税"、決算月の 3 など保存されたまま）。
 * 未入力は null で返し、**キーは絶対に落とさない**（呼び出し側が列を固定で埋めるため）。
 */
export function buildContractItem(row: ContractProjectRow, options: BuildContractItemOptions) {
  const c = row.customer;
  const data = (row.projectCustomData ?? {}) as Record<string, unknown>;
  const linkData = (c.businessLinks[0]?.linkCustomData ?? {}) as Record<string, unknown>;

  const representative = c.contacts.find((x) => x.contactIsRepresentative) ?? null;
  // 担当者は代表者以外の主担当。無ければ代表者以外の先頭（並び順は呼び出し側で担保）
  const others = c.contacts.filter((x) => !x.contactIsRepresentative);
  const contact = others.find((x) => x.contactIsPrimary) ?? others[0] ?? null;

  const bank = options.pickBankAccount(c.bankAccounts, options.businessId);
  const bankScope = bank === null ? null : bank.businessId === null ? 'common' : 'business';

  return {
    // --- 案件 ---
    project_no: row.projectNo,
    project_url: options.projectUrl,
    mo_no: (linkData.mo_no as string | undefined) ?? null,
    customer_id: c.id,
    customer_code: c.customerCode,
    customer_url: options.customerUrl,

    status_code: row.projectSalesStatus,
    status: options.statusLabel,
    status_changed_at: row.projectStatusChangedAt ? row.projectStatusChangedAt.toISOString() : null,

    // --- 顧客の基本情報 ---
    company_name: c.customerName,
    customer_salutation: c.customerSalutation,
    customer_type: c.customerType,
    purchase_count: customValue(data, 'purchase_count'),
    fiscal_month: c.customerFiscalMonth,
    assigned_user_name: row.projectAssignedUserName,

    // --- 契約内容 ---
    needs: customValue(data, 'needs'),
    unit_count: customValue(data, 'unit_count'),
    unit_price: customValue(data, 'purchase_unit_price'),
    purchase_amount: customValue(data, 'purchase_amount'),
    sales_contract_date: customValue(data, 'sales_contract_date'),
    operation_contract_date: customValue(data, 'operation_contract_date'),
    payment_received_date: customValue(data, 'payment_received_date'),
    project_notes: row.projectNotes,

    // --- 連絡先 ---
    representative_name: representative?.contactName ?? null,
    representative_phone: representative?.contactPhone ?? null,
    representative_email: representative?.contactEmail ?? null,
    contact_name: contact?.contactName ?? null,
    contact_phone: contact?.contactPhone ?? null,
    contact_email: contact?.contactEmail ?? null,

    // --- 所在地・番号 ---
    postal_code: c.customerPostalCode,
    address: c.customerAddress,
    corporate_no: c.customerCorporateNumber,
    invoice_no: c.customerInvoiceNumber,
    company_phone: c.customerPhone,

    // --- 工業会証明書の送り先（感謝状の送付先・名義と同じものとして扱う運用） ---
    thank_you_recipient: customValue(data, 'thank_you_recipient'),
    gratitude_certificate_name: customValue(data, 'gratitude_certificate_name'),

    // --- 中企庁申請 ---
    sme_agency_applicant: customValue(data, 'sme_agency_applicant'),

    // --- 口座（平文。ログには出さない） ---
    bank_name: bank?.bankName ?? null,
    bank_branch: bank?.branchName ?? null,
    account_type: bank?.accountType ?? null,
    account_no: bank?.accountNumber ?? null,
    account_holder: bank?.accountHolder ?? null,
    bank_account_scope: bankScope,
  };
}

/** レスポンスの item が必ず持つキー（テストと仕様書のドリフト検知に使う） */
export const CONTRACT_ITEM_KEYS = [
  'project_no', 'project_url', 'mo_no', 'customer_id', 'customer_code', 'customer_url',
  'status_code', 'status', 'status_changed_at',
  'company_name', 'customer_salutation', 'customer_type', 'purchase_count', 'fiscal_month', 'assigned_user_name',
  'needs', 'unit_count', 'unit_price', 'purchase_amount',
  'sales_contract_date', 'operation_contract_date', 'payment_received_date', 'project_notes',
  'representative_name', 'representative_phone', 'representative_email',
  'contact_name', 'contact_phone', 'contact_email',
  'postal_code', 'address', 'corporate_no', 'invoice_no', 'company_phone',
  'thank_you_recipient', 'gratitude_certificate_name',
  'sme_agency_applicant',
  'bank_name', 'bank_branch', 'account_type', 'account_no', 'account_holder', 'bank_account_scope',
] as const;
