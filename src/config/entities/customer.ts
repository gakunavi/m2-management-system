import { z } from 'zod';
import type { EntityListConfig, EntityDetailConfig, EntityFormConfig } from '@/types/config';

// ============================================
// 顧客種別オプション
// ============================================

const CUSTOMER_TYPE_OPTIONS = [
  { value: '法人', label: '法人' },
  { value: '個人事業主', label: '個人事業主' },
  { value: '個人', label: '個人' },
  { value: '確認中', label: '確認中' },
  { value: '未設定', label: '未設定' },
];

// ============================================
// 業種マスタ設定
// ============================================

const INDUSTRY_MASTER_CONFIG = {
  endpoint: '/industries',
  labelField: 'industryName',
  modalTitle: '業種管理',
};

// ============================================
// 顧客マスタ一覧 Config
// ============================================

export const customerListConfig: EntityListConfig = {
  entityType: 'customer',
  apiEndpoint: '/customers',
  title: '顧客マスタ一覧',
  inlineEditable: true,
  patchEndpoint: (id) => `/customers/${id}`,
  columns: [
    // ===== 読み取り専用（自動生成）=====
    { key: 'customerCode', label: '顧客コード', width: 120, sortable: true },

    // ===== 編集可能フィールド =====
    {
      key: 'customerName',
      label: '顧客名',
      minWidth: 200,
      sortable: true,
      edit: {
        type: 'text',
        placeholder: '例：株式会社〇〇',
        validate: (v) =>
          typeof v === 'string' && v.trim().length > 0
            ? { success: true }
            : { success: false, error: '必須' },
      },
    },
    {
      key: 'customerSalutation',
      label: '呼称',
      width: 150,
      sortable: true,
      edit: { type: 'text', placeholder: '例：テクノ' },
    },
    {
      key: 'customerType',
      label: '種別',
      width: 110,
      sortable: true,
      edit: { type: 'select', options: CUSTOMER_TYPE_OPTIONS },
    },
    // ===== 担当者情報（別テーブルの customPatch で編集）=====
    {
      key: 'representativeName',
      label: '代表者',
      width: 140,
      sortable: false,
      defaultVisible: false,
      edit: { type: 'text', placeholder: '代表者名' },
      customPatch: {
        endpoint: (row) => row.representativeId ? `/customers/${row.id}/contacts/${row.representativeId}` : '',
        field: 'contactName',
      },
      render: (value, row) => {
        const position = row.representativePosition as string | null;
        if (!value) return '-';
        return position ? `${value}（${position}）` : String(value);
      },
    },
    {
      key: 'primaryContactName',
      label: '主担当者',
      width: 140,
      sortable: false,
      edit: { type: 'text', placeholder: '担当者名' },
      customPatch: {
        endpoint: (row) => row.primaryContactId ? `/customers/${row.id}/contacts/${row.primaryContactId}` : '',
        field: 'contactName',
      },
      render: (value, row) => {
        const dept = row.primaryContactDepartment as string | null;
        if (!value) return '-';
        return dept ? `${value}（${dept}）` : String(value);
      },
    },
    {
      key: 'primaryContactPhone',
      label: '担当者TEL',
      width: 140,
      sortable: false,
      defaultVisible: false,
      edit: { type: 'phone', placeholder: '03-0000-0000' },
      customPatch: {
        endpoint: (row) => row.primaryContactId ? `/customers/${row.id}/contacts/${row.primaryContactId}` : '',
        field: 'contactPhone',
      },
    },
    {
      key: 'primaryContactEmail',
      label: '担当者メール',
      width: 200,
      sortable: false,
      defaultVisible: false,
      edit: { type: 'email', placeholder: 'example@example.com' },
      customPatch: {
        endpoint: (row) => row.primaryContactId ? `/customers/${row.id}/contacts/${row.primaryContactId}` : '',
        field: 'contactEmail',
      },
    },

    // ===== その他フィールド =====
    {
      key: 'customerPostalCode',
      label: '郵便番号',
      width: 110,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'text', placeholder: '000-0000' },
    },
    {
      key: 'customerAddress',
      label: '住所',
      minWidth: 200,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'text', placeholder: '都道府県・市区町村・番地' },
    },
    {
      key: 'customerPhone',
      label: '電話番号',
      width: 140,
      sortable: true,
      edit: { type: 'phone', placeholder: '03-0000-0000' },
    },
    {
      key: 'customerFax',
      label: 'FAX',
      width: 140,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'phone', placeholder: '03-0000-0000' },
    },
    {
      key: 'customerEmail',
      label: 'メール',
      width: 200,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'email', placeholder: 'info@example.com' },
    },
    {
      key: 'customerWebsite',
      label: 'Webサイト',
      width: 200,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'url', placeholder: 'https://example.com' },
    },
    {
      key: 'industryId',
      label: '業種',
      width: 150,
      sortable: false,
      edit: {
        type: 'master-select',
        optionsEndpoint: '/industries',
        labelField: 'industryName',
        placeholder: '業種を選択',
      },
      render: (_value, row) => {
        const industry = row.industry as { industryName: string } | null;
        return industry?.industryName ?? '-';
      },
    },
    {
      key: 'customerCorporateNumber',
      label: '法人番号',
      width: 150,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'text', placeholder: '13桁の数字' },
    },
    {
      key: 'customerInvoiceNumber',
      label: 'インボイス番号',
      width: 160,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'text', placeholder: 'T + 13桁の数字' },
    },
    {
      key: 'customerCapital',
      label: '資本金',
      width: 140,
      align: 'right',
      sortable: true,
      defaultVisible: false,
      edit: { type: 'number', placeholder: '0' },
      render: (v) => (v != null ? `${Number(v).toLocaleString()}円` : '-'),
    },
    {
      key: 'customerFiscalMonth',
      label: '決算月',
      width: 100,
      sortable: true,
      defaultVisible: false,
      edit: {
        type: 'select',
        options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` })),
      },
      render: (v) => (v != null ? `${v}月` : '-'),
    },
    {
      key: 'customerEstablishedDate',
      label: '設立日',
      width: 130,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'date' },
    },
    {
      key: 'customerFolderUrl',
      label: 'フォルダURL',
      width: 200,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'url', placeholder: 'https://drive.example.com/...' },
    },
    {
      key: 'customerNotes',
      label: 'メモ',
      width: 200,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'textarea' },
    },
    {
      key: 'customerIsActive',
      label: 'ステータス',
      width: 90,
      align: 'center',
      sortable: true,
      edit: { type: 'checkbox' },
      render: (value) => (value ? '有効' : '無効'),
    },

    // ===== 読み取り専用（自動）=====
    { key: 'updatedAt', label: '更新日時', width: 150, sortable: true },
    { key: 'createdAt', label: '作成日時', width: 150, sortable: true, defaultVisible: false },
  ],
  search: {
    placeholder: '顧客名・顧客コード・担当者名で検索...',
    fields: ['customerName', 'customerCode', 'contactName'],
    debounceMs: 300,
  },
  filters: [
    {
      key: 'customerType',
      label: '種別',
      type: 'multi-select',
      options: CUSTOMER_TYPE_OPTIONS,
    },
    {
      key: 'industryId',
      label: '業種',
      type: 'multi-select',
      optionsEndpoint: '/customers/filter-options',
    },
    {
      key: 'isActive',
      label: '状態',
      type: 'boolean',
      trueLabel: '有効',
      falseLabel: '無効（削除済み）',
    },
    {
      key: 'customerAddress',
      label: '住所',
      type: 'text',
      placeholder: '住所キーワード...',
    },
    {
      key: 'createdAt',
      label: '作成日',
      type: 'date-range',
    },
    {
      key: 'customerCapital',
      label: '資本金',
      type: 'number-range',
      unit: '円',
      min: 0,
    },
    {
      key: 'customerEstablishedDate',
      label: '設立日',
      type: 'date-range',
    },
  ],
  defaultSort: { field: 'customerCode', direction: 'asc' },
  tableSettings: {
    persistKey: 'customer-list',
    defaultPageSize: 25,
    defaultDensity: 'normal',
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },
  detailPath: (id) => `/customers/${id}`,
  createPath: '/customers/new',
  batchActions: [
    {
      key: 'delete',
      label: '一括削除',
      variant: 'destructive',
      confirm: {
        title: '一括削除',
        message: (count: number) => `選択した ${count} 件の顧客を削除（無効化）しますか？この操作は管理者が復元できます。`,
      },
      apiEndpoint: '/customers/batch',
      onComplete: 'refresh',
    },
  ],
  csv: {
    importEnabled: true,
    exportEnabled: true,
    endpoint: '/customers/csv',
    columnKeyMap: {
      industryId: 'industryName',
      representativeName: 'representativeName',
      primaryContactName: 'primaryContactName',
      primaryContactPhone: 'primaryContactPhone',
      primaryContactEmail: 'primaryContactEmail',
    },
    templateColumns: [
      { key: 'customerCode', label: '顧客コード', required: true, description: '一意の顧客コード（例: CST-0001）', example: 'CST-0001' },
      { key: 'customerName', label: '顧客名', required: true, description: '顧客の正式名称', example: '株式会社サンプル' },
      { key: 'customerSalutation', label: '呼称', description: '社内での呼称', example: 'サンプル' },
      { key: 'customerType', label: '種別', description: '法人 / 個人事業主 / 個人 / 確認中 / 未設定', example: '法人' },
      { key: 'customerPostalCode', label: '郵便番号', description: 'ハイフンあり・なし両対応', example: '100-0001' },
      { key: 'customerAddress', label: '住所', example: '東京都千代田区千代田1-1' },
      { key: 'customerPhone', label: '電話番号', example: '03-1234-5678' },
      { key: 'customerFax', label: 'FAX', example: '03-1234-5679' },
      { key: 'customerEmail', label: 'メールアドレス', example: 'info@example.com' },
      { key: 'customerWebsite', label: 'Webサイト', example: 'https://example.com' },
      { key: 'representativeName', label: '代表者名', description: '代表者の氏名', example: '山田太郎' },
      { key: 'representativePosition', label: '代表者役職', description: '代表者の役職', example: '代表取締役' },
      { key: 'primaryContactName', label: '主担当者名', description: '主担当者の氏名', example: '鈴木花子' },
      { key: 'primaryContactDepartment', label: '主担当者部署', description: '主担当者の部署', example: '営業部' },
      { key: 'primaryContactPhone', label: '主担当者TEL', description: '主担当者の電話番号', example: '03-1234-5680' },
      { key: 'primaryContactEmail', label: '主担当者メール', description: '主担当者のメールアドレス', example: 'suzuki@example.com' },
      { key: 'industryName', label: '業種', description: '業種マスタに登録済みの名称', example: '情報通信業' },
      { key: 'customerCorporateNumber', label: '法人番号', description: '13桁の数字', example: '1234567890123' },
      { key: 'customerInvoiceNumber', label: 'インボイス番号', description: 'T + 13桁の数字', example: 'T1234567890123' },
      { key: 'customerCapital', label: '資本金', description: '数値（円）', example: '10000000' },
      { key: 'customerFiscalMonth', label: '決算月', description: '1〜12の数字', example: '3' },
      { key: 'customerEstablishedDate', label: '設立日', description: 'YYYY-MM-DD 形式', example: '2020-01-01' },
      { key: 'customerFolderUrl', label: 'フォルダURL', example: '' },
      { key: 'customerNotes', label: 'メモ', example: '' },
      { key: 'customerIsActive', label: '有効フラグ', description: '1=有効、0=無効', example: '1' },
    ],
  },
};

// ============================================
// 顧客詳細 Config
// ============================================

export const customerDetailConfig: EntityDetailConfig = {
  entityType: 'customer',
  apiEndpoint: (id) => `/customers/${id}`,
  title: (data) => data.customerName as string,
  tabs: [
    {
      key: 'info',
      label: '基本情報',
      component: 'info',
      config: {
        sections: [
          {
            title: '基本情報',
            columns: 2,
            fields: [
              { key: 'customerCode', label: '顧客コード', type: 'text' },
              { key: 'customerType', label: '種別', type: 'text' },
              { key: 'customerName', label: '顧客名', type: 'text', colSpan: 2 },
              { key: 'customerSalutation', label: '呼称', type: 'text', colSpan: 2 },
            ],
          },
          {
            title: '連絡先',
            columns: 2,
            fields: [
              { key: 'customerPostalCode', label: '郵便番号', type: 'text' },
              { key: 'customerPhone', label: '電話番号', type: 'phone' },
              { key: 'customerAddress', label: '住所', type: 'text', colSpan: 2 },
              { key: 'customerFax', label: 'FAX', type: 'phone' },
              { key: 'customerEmail', label: 'メール', type: 'email' },
              { key: 'customerWebsite', label: 'Webサイト', type: 'url' },
            ],
          },
          {
            title: '企業情報',
            columns: 2,
            fields: [
              {
                key: 'industryId',
                label: '業種',
                type: 'text',
                render: (_value, data) => {
                  const industry = data.industry as { industryName: string } | null;
                  return industry?.industryName ?? '-';
                },
              },
              {
                key: 'customerFiscalMonth',
                label: '決算月',
                type: 'text',
                render: (v) => (v != null ? `${v}月` : '-'),
              },
              { key: 'customerEstablishedDate', label: '設立日', type: 'date' },
              { key: 'customerCorporateNumber', label: '法人番号', type: 'text' },
              { key: 'customerInvoiceNumber', label: 'インボイス番号', type: 'text' },
              { key: 'customerCapital', label: '資本金', type: 'currency' },
            ],
          },
          {
            title: 'その他',
            columns: 1,
            fields: [
              { key: 'customerFolderUrl', label: 'フォルダURL', type: 'url', colSpan: 2 },
              { key: 'customerNotes', label: 'メモ', type: 'text', colSpan: 2 },
            ],
          },
        ],
      },
    },
    {
      key: 'contacts',
      label: '担当者',
      component: 'contacts',
      config: {
        apiEndpoint: (parentId: string) => `/customers/${parentId}/contacts`,
      },
    },
    {
      key: 'bankAccounts',
      label: '口座情報',
      component: 'custom',
      config: {},
    },
    {
      key: 'businesses',
      label: '関連事業',
      component: 'related',
      config: {
        apiEndpoint: (parentId: string) => `/customers/${parentId}/business-links`,
        columns: [
          { key: 'businessName', label: '事業名', minWidth: 150 },
          { key: 'businessCode', label: '事業コード', width: 120 },
          { key: 'linkStatus', label: 'ステータス', width: 100 },
        ],
      },
    },
    {
      key: 'projects',
      label: '関連案件',
      component: 'custom',
      config: {},
    },
  ],
  actions: {
    edit: true,
    delete: true,
    restore: {
      activeField: 'customerIsActive',
      apiEndpoint: (id) => `/customers/${id}/restore`,
      requiredRole: ['admin'],
    },
  },
};

// ============================================
// 顧客フォーム Config
// ============================================

export const customerFormConfig: EntityFormConfig = {
  entityType: 'customer',
  apiEndpoint: '/customers',
  title: { create: '顧客新規登録', edit: '顧客編集' },
  sections: [
    {
      title: '基本情報',
      columns: 2,
      fields: [
        {
          key: 'customerType',
          label: '種別',
          type: 'select',
          required: true,
          options: CUSTOMER_TYPE_OPTIONS,
        },
        {
          key: 'customerName',
          label: '顧客名',
          type: 'text',
          required: true,
          placeholder: '例：株式会社〇〇',
          colSpan: 2,
          duplicateCheck: {
            endpoint: '/customers',
            labelField: 'customerName',
            comboFields: [{ formKey: 'customerPhone', paramKey: 'phone' }],
          },
        },
        { key: 'customerSalutation', label: '呼称', type: 'text', placeholder: '例：テクノ（株式会社テクノロジーソリューションズの社内呼称）', colSpan: 2 },
      ],
    },
    {
      title: '連絡先',
      columns: 2,
      fields: [
        { key: 'customerPostalCode', label: '郵便番号', type: 'text', placeholder: '000-0000' },
        { key: 'customerPhone', label: '電話番号', type: 'phone', placeholder: '03-0000-0000' },
        { key: 'customerAddress', label: '住所', type: 'text', placeholder: '都道府県・市区町村・番地', colSpan: 2 },
        { key: 'customerFax', label: 'FAX', type: 'phone', placeholder: '03-0000-0000' },
        { key: 'customerEmail', label: 'メールアドレス', type: 'email', placeholder: 'info@example.com' },
        { key: 'customerWebsite', label: 'Webサイト', type: 'url', placeholder: 'https://example.com' },
      ],
    },
    {
      title: '企業情報',
      columns: 2,
      fields: [
        {
          key: 'industryId',
          label: '業種',
          type: 'master-select',
          masterSelect: INDUSTRY_MASTER_CONFIG,
        },
        {
          key: 'customerFiscalMonth',
          label: '決算月',
          type: 'select',
          options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` })),
          placeholder: '決算月を選択',
        },
        { key: 'customerEstablishedDate', label: '設立日', type: 'date' },
        { key: 'customerCorporateNumber', label: '法人番号', type: 'text', placeholder: '13桁の数字' },
        { key: 'customerInvoiceNumber', label: 'インボイス登録番号', type: 'text', placeholder: 'T + 13桁の数字' },
        { key: 'customerCapital', label: '資本金（円）', type: 'number', placeholder: '0' },
      ],
    },
    {
      title: 'その他',
      columns: 1,
      fields: [
        { key: 'customerFolderUrl', label: 'フォルダURL', type: 'url', placeholder: 'https://drive.example.com/...', colSpan: 1 },
        { key: 'customerNotes', label: 'メモ', type: 'textarea', placeholder: '備考・メモを入力...', colSpan: 1 },
      ],
    },
  ],
  validationSchema: z.object({
    customerName: z.string().min(1, '顧客名は必須です').max(200, '顧客名は200文字以内で入力してください'),
    customerSalutation: z.string().max(100, '呼称は100文字以内で入力してください').optional().nullable(),
    customerType: z.enum(['法人', '個人事業主', '個人', '確認中', '未設定']).default('未設定'),
    customerPostalCode: z.string().max(10).optional().nullable(),
    customerAddress: z.string().optional().nullable(),
    customerPhone: z.string().max(20).optional().nullable(),
    customerFax: z.string().max(20).optional().nullable(),
    customerEmail: z.string().email('有効なメールアドレスを入力してください').optional().nullable().or(z.literal('')),
    customerWebsite: z.string().url('有効なURLを入力してください').optional().nullable().or(z.literal('')),
    industryId: z.number().int().positive().optional().nullable(),
    customerCorporateNumber: z
      .string()
      .regex(/^\d{13}$/, '法人番号は13桁の数字で入力してください')
      .optional()
      .nullable()
      .or(z.literal('')),
    customerInvoiceNumber: z
      .string()
      .regex(/^T\d{13}$/, 'インボイス番号は「T」+13桁の数字で入力してください')
      .optional()
      .nullable()
      .or(z.literal('')),
    customerCapital: z.number().int().min(0).optional().nullable(),
    customerFiscalMonth: z.number().int().min(1).max(12).optional().nullable(),
    customerEstablishedDate: z.string().optional().nullable(),
    customerFolderUrl: z.string().url('有効なURLを入力してください').optional().nullable().or(z.literal('')),
    customerNotes: z.string().optional().nullable(),
  }),
  redirectAfterSave: (id) => `/customers/${id}`,
  warnOnLeave: true,
};
