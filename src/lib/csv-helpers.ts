// ============================================
// CSV 共通ヘルパー
// ============================================

/**
 * CSV ヘッダー定義の型
 */
export interface CsvHeaderDef {
  key: string;
  label: string;
}

/**
 * テンプレート列定義の型（ヘッダー定義 + 必須/例）
 */
export interface CsvTemplateDef {
  key: string;
  label: string;
  required?: boolean;
  example: string;
}

/**
 * 顧客 CSV ヘッダー定義
 * エクスポート・インポート共通で使用
 */
export const CUSTOMER_CSV_HEADERS: readonly CsvHeaderDef[] = [
  { key: 'customerCode', label: '顧客コード' },
  { key: 'customerName', label: '顧客名' },
  { key: 'customerSalutation', label: '呼称' },
  { key: 'customerType', label: '種別' },
  { key: 'customerPostalCode', label: '郵便番号' },
  { key: 'customerAddress', label: '住所' },
  { key: 'customerPhone', label: '電話番号' },
  { key: 'customerFax', label: 'FAX' },
  { key: 'customerEmail', label: 'メールアドレス' },
  { key: 'customerWebsite', label: 'Webサイト' },
  { key: 'representativeName', label: '代表者名' },
  { key: 'representativePosition', label: '代表者役職' },
  { key: 'primaryContactName', label: '主担当者名' },
  { key: 'primaryContactDepartment', label: '主担当者部署' },
  { key: 'primaryContactPhone', label: '主担当者TEL' },
  { key: 'primaryContactEmail', label: '主担当者メール' },
  { key: 'industryName', label: '業種' },
  { key: 'customerCorporateNumber', label: '法人番号' },
  { key: 'customerInvoiceNumber', label: 'インボイス番号' },
  { key: 'customerCapital', label: '資本金' },
  { key: 'customerEstablishedDate', label: '設立日' },
  { key: 'customerFolderUrl', label: 'フォルダURL' },
  { key: 'customerNotes', label: 'メモ' },
  { key: 'customerIsActive', label: '有効フラグ' },
  { key: 'createdAt', label: '作成日時' },
  { key: 'updatedAt', label: '更新日時' },
] as const;

/**
 * 顧客テンプレート列定義
 * CUSTOMER_CSV_HEADERS のインポート対象列（createdAt/updatedAt除外）に
 * 必須フラグと入力例を付加
 */
export const CUSTOMER_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'customerCode', label: '顧客コード', required: true, example: 'CST-0001' },
  { key: 'customerName', label: '顧客名', required: true, example: '株式会社サンプル' },
  { key: 'customerSalutation', label: '呼称', example: 'サンプル' },
  { key: 'customerType', label: '種別', example: '法人' },
  { key: 'customerPostalCode', label: '郵便番号', example: '100-0001' },
  { key: 'customerAddress', label: '住所', example: '東京都千代田区千代田1-1' },
  { key: 'customerPhone', label: '電話番号', example: '03-1234-5678' },
  { key: 'customerFax', label: 'FAX', example: '03-1234-5679' },
  { key: 'customerEmail', label: 'メールアドレス', example: 'info@example.com' },
  { key: 'customerWebsite', label: 'Webサイト', example: 'https://example.com' },
  { key: 'representativeName', label: '代表者名', example: '山田太郎' },
  { key: 'representativePosition', label: '代表者役職', example: '代表取締役' },
  { key: 'primaryContactName', label: '主担当者名', example: '鈴木花子' },
  { key: 'primaryContactDepartment', label: '主担当者部署', example: '営業部' },
  { key: 'primaryContactPhone', label: '主担当者TEL', example: '03-1234-5680' },
  { key: 'primaryContactEmail', label: '主担当者メール', example: 'suzuki@example.com' },
  { key: 'industryName', label: '業種', example: '情報通信業' },
  { key: 'customerCorporateNumber', label: '法人番号', example: '1234567890123' },
  { key: 'customerInvoiceNumber', label: 'インボイス番号', example: 'T1234567890123' },
  { key: 'customerCapital', label: '資本金', example: '10000000' },
  { key: 'customerEstablishedDate', label: '設立日', example: '2020-01-01' },
  { key: 'customerFolderUrl', label: 'フォルダURL', example: '' },
  { key: 'customerNotes', label: 'メモ', example: '' },
  { key: 'customerIsActive', label: '有効フラグ', example: '1' },
] as const;

/**
 * 代理店 CSV ヘッダー定義
 */
export const PARTNER_CSV_HEADERS: readonly CsvHeaderDef[] = [
  { key: 'partnerCode', label: '代理店コード' },
  { key: 'partnerTierNumber', label: '階層番号' },
  { key: 'partnerTier', label: '階層' },
  { key: 'parentPartnerName', label: '親代理店' },
  { key: 'partnerName', label: '代理店名' },
  { key: 'partnerSalutation', label: '呼称' },
  { key: 'partnerType', label: '種別' },
  { key: 'partnerPostalCode', label: '郵便番号' },
  { key: 'partnerAddress', label: '住所' },
  { key: 'partnerPhone', label: '電話番号' },
  { key: 'partnerFax', label: 'FAX' },
  { key: 'partnerEmail', label: 'メールアドレス' },
  { key: 'partnerWebsite', label: 'Webサイト' },
  { key: 'representativeName', label: '代表者名' },
  { key: 'representativePosition', label: '代表者役職' },
  { key: 'primaryContactName', label: '主担当者名' },
  { key: 'primaryContactDepartment', label: '主担当者部署' },
  { key: 'primaryContactPhone', label: '主担当者TEL' },
  { key: 'primaryContactEmail', label: '主担当者メール' },
  { key: 'industryName', label: '業種' },
  { key: 'partnerEstablishedDate', label: '設立日' },
  { key: 'partnerCorporateNumber', label: '法人番号' },
  { key: 'partnerInvoiceNumber', label: 'インボイス番号' },
  { key: 'partnerCapital', label: '資本金' },
  { key: 'partnerFolderUrl', label: 'フォルダURL' },
  { key: 'partnerNotes', label: '備考' },
  { key: 'partnerIsActive', label: '有効フラグ' },
  { key: 'createdAt', label: '作成日時' },
  { key: 'updatedAt', label: '更新日時' },
] as const;

/**
 * 代理店テンプレート列定義
 */
export const PARTNER_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'partnerCode', label: '代理店コード', required: true, example: 'AG-0001' },
  { key: 'partnerName', label: '代理店名', required: true, example: '株式会社サンプル代理店' },
  { key: 'partnerTier', label: '階層', example: '1次代理店' },
  { key: 'partnerSalutation', label: '呼称', example: 'サンプル' },
  { key: 'partnerType', label: '種別', example: '法人' },
  { key: 'partnerPostalCode', label: '郵便番号', example: '100-0001' },
  { key: 'partnerAddress', label: '住所', example: '東京都千代田区千代田1-1' },
  { key: 'partnerPhone', label: '電話番号', example: '03-1234-5678' },
  { key: 'partnerFax', label: 'FAX', example: '03-1234-5679' },
  { key: 'partnerEmail', label: 'メールアドレス', example: 'info@example.com' },
  { key: 'partnerWebsite', label: 'Webサイト', example: 'https://example.com' },
  { key: 'representativeName', label: '代表者名', example: '山田太郎' },
  { key: 'representativePosition', label: '代表者役職', example: '代表取締役' },
  { key: 'primaryContactName', label: '主担当者名', example: '鈴木花子' },
  { key: 'primaryContactDepartment', label: '主担当者部署', example: '営業部' },
  { key: 'primaryContactPhone', label: '主担当者TEL', example: '03-1234-5680' },
  { key: 'primaryContactEmail', label: '主担当者メール', example: 'suzuki@example.com' },
  { key: 'industryName', label: '業種', example: '情報通信業' },
  { key: 'partnerEstablishedDate', label: '設立日', example: '2020-01-01' },
  { key: 'partnerCorporateNumber', label: '法人番号', example: '1234567890123' },
  { key: 'partnerInvoiceNumber', label: 'インボイス番号', example: 'T1234567890123' },
  { key: 'partnerCapital', label: '資本金', example: '10000000' },
  { key: 'partnerFolderUrl', label: 'フォルダURL', example: '' },
  { key: 'partnerNotes', label: '備考', example: '' },
  { key: 'partnerIsActive', label: '有効フラグ', example: '1' },
] as const;

/**
 * 事業 CSV ヘッダー定義
 */
export const BUSINESS_CSV_HEADERS: readonly CsvHeaderDef[] = [
  { key: 'businessCode', label: '事業コード' },
  { key: 'businessName', label: '事業名' },
  { key: 'businessDescription', label: '説明' },
  { key: 'businessSortOrder', label: '表示順' },
  { key: 'businessIsActive', label: '有効フラグ' },
  { key: 'createdAt', label: '作成日時' },
  { key: 'updatedAt', label: '更新日時' },
] as const;

/**
 * 事業テンプレート列定義
 */
export const BUSINESS_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'businessCode', label: '事業コード', required: true, example: 'SMP' },
  { key: 'businessName', label: '事業名', required: true, example: 'サンプル事業' },
  { key: 'businessDescription', label: '説明', example: 'サンプル事業の説明' },
  { key: 'businessSortOrder', label: '表示順', example: '1' },
  { key: 'businessIsActive', label: '有効フラグ', example: '1' },
] as const;

// ============================================
// 事業設定テンプレート列定義
// ============================================

/**
 * 営業ステータス定義テンプレート
 */
export const STATUS_DEFINITION_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'statusCode', label: 'ステータスコード', required: true, example: 'purchased' },
  { key: 'statusLabel', label: '表示ラベル', required: true, example: '1.購入済み' },
  { key: 'statusPriority', label: '優先順位', example: '1' },
  { key: 'statusColor', label: '表示色', example: '#22c55e' },
  { key: 'statusIsFinal', label: '最終ステータス', example: '0' },
  { key: 'statusIsLost', label: '失注ステータス', example: '0' },
  { key: 'statusSortOrder', label: '表示順', example: '0' },
  { key: 'statusIsActive', label: '有効フラグ', example: '1' },
] as const;

/**
 * ムーブメント定義テンプレート
 */
export const MOVEMENT_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'stepCode', label: 'ステップコード', required: true, example: 'delivery_prep' },
  { key: 'stepName', label: 'ステップ名', required: true, example: '納品準備' },
  { key: 'stepDescription', label: '説明', example: 'ステップの詳細説明' },
  { key: 'stepIsSalesLinked', label: 'ステータス連動', example: '0' },
  { key: 'stepLinkedStatusCode', label: '連動ステータスコード', example: '' },
  { key: 'stepIsActive', label: '有効フラグ', example: '1' },
  { key: 'visibleToPartner', label: '代理店表示', example: '0' },
] as const;

/**
 * 案件カスタムフィールド定義テンプレート
 */
export const PROJECT_FIELD_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'key', label: 'フィールドキー', required: true, example: 'project_amount' },
  { key: 'label', label: '表示ラベル', required: true, example: '案件金額' },
  { key: 'type', label: '型', required: true, example: '数値' },
  { key: 'options', label: '選択肢（カンマ区切り）', example: '' },
  { key: 'required', label: '必須', example: '0' },
  { key: 'description', label: '説明', example: '税込金額を入力' },
  { key: 'sortOrder', label: '表示順', example: '0' },
  { key: 'visibleToPartner', label: '代理店表示', example: '1' },
] as const;

/** 案件フィールド型: 日本語 → 内部値マッピング（英語入力も受け付ける） */
export const FIELD_TYPE_LABEL_MAP: Record<string, string> = {
  'テキスト': 'text',
  'テキストエリア': 'textarea',
  '数値': 'number',
  '日付': 'date',
  '年月': 'month',
  '選択': 'select',
  'チェックボックス': 'checkbox',
  'URL': 'url',
  'url': 'url',
  // 英語そのままでも受け付け
  'text': 'text',
  'textarea': 'textarea',
  'number': 'number',
  'date': 'date',
  'month': 'month',
  'select': 'select',
  'checkbox': 'checkbox',
};

/** KPI集計方法: 日本語 → 内部値マッピング（英語入力も受け付ける） */
export const AGGREGATION_LABEL_MAP: Record<string, string> = {
  '合計': 'sum',
  'カウント': 'count',
  '件数': 'count',
  'sum': 'sum',
  'count': 'count',
};

/**
 * KPI定義テンプレート
 */
export const KPI_DEFINITION_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'key', label: 'KPIキー', required: true, example: 'revenue' },
  { key: 'label', label: 'ラベル', required: true, example: '売上金額' },
  { key: 'unit', label: '単位', example: '円' },
  { key: 'aggregation', label: '集計方法', example: '合計' },
  { key: 'sourceField', label: '金額フィールド', example: 'project_amount' },
  { key: 'statusFilter', label: '対象ステータス', example: '' },
  { key: 'dateField', label: '計上月基準', example: 'projectExpectedCloseMonth' },
  { key: 'isPrimary', label: 'プライマリ', example: '1' },
  { key: 'sortOrder', label: '表示順', example: '0' },
] as const;

/**
 * ファイルカテゴリ定義テンプレート
 */
export const FILE_CATEGORY_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'key', label: 'カテゴリキー', required: true, example: 'checklist' },
  { key: 'label', label: '表示名', required: true, example: 'チェックリスト' },
  { key: 'sortOrder', label: '表示順', example: '0' },
] as const;

// ============================================
// 口座情報テンプレート列定義
// ============================================

/**
 * 顧客口座情報テンプレート
 */
export const CUSTOMER_BANK_ACCOUNT_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'customerCode', label: '顧客コード', required: true, example: 'CST-0001' },
  { key: 'businessCode', label: '事業コード', example: '' },
  { key: 'bankName', label: '金融機関名', required: true, example: 'みずほ銀行' },
  { key: 'branchName', label: '支店名', required: true, example: '東京中央支店' },
  { key: 'accountType', label: '口座種別', required: true, example: '普通' },
  { key: 'accountNumber', label: '口座番号', required: true, example: '1234567' },
  { key: 'accountHolder', label: '名義人', required: true, example: 'カ）サンプル' },
] as const;

/**
 * 代理店口座情報テンプレート
 */
export const PARTNER_BANK_ACCOUNT_TEMPLATE_COLUMNS: readonly CsvTemplateDef[] = [
  { key: 'partnerCode', label: '代理店コード', required: true, example: 'AG-0001' },
  { key: 'businessCode', label: '事業コード', example: '' },
  { key: 'bankName', label: '金融機関名', required: true, example: 'みずほ銀行' },
  { key: 'branchName', label: '支店名', required: true, example: '東京中央支店' },
  { key: 'accountType', label: '口座種別', required: true, example: '普通' },
  { key: 'accountNumber', label: '口座番号', required: true, example: '1234567' },
  { key: 'accountHolder', label: '名義人', required: true, example: 'カ）サンプルダイリテン' },
] as const;

/**
 * CSV エスケープ
 */
export function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * CSV 行パーサー（クォートに対応）
 */
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
