import { z } from 'zod';
import type { EntityListConfig, EntityDetailConfig, EntityFormConfig } from '@/types/config';

// ============================================
// 代理店種別オプション
// ============================================

const PARTNER_TYPE_OPTIONS = [
  { value: '法人', label: '法人' },
  { value: '個人事業主', label: '個人事業主' },
  { value: '個人', label: '個人' },
  { value: '確認中', label: '確認中' },
  { value: '未設定', label: '未設定' },
];

// PARTNER_TIER_OPTIONS は廃止（N次対応: 親代理店選択から自動算出）

// ============================================
// 業種マスタ設定
// ============================================

const INDUSTRY_MASTER_CONFIG = {
  endpoint: '/industries',
  labelField: 'industryName',
  modalTitle: '業種管理',
};

// ============================================
// 代理店マスタ一覧 Config
// ============================================

export const partnerListConfig: EntityListConfig = {
  entityType: 'partner',
  apiEndpoint: '/partners',
  title: '代理店マスタ一覧',
  inlineEditable: true,
  patchEndpoint: (id) => `/partners/${id}`,
  columns: [
    // ===== 読み取り専用（自動生成）=====
    { key: 'partnerCode', label: '代理店コード', width: 130, sortable: true },

    // ===== 編集可能フィールド =====
    {
      key: 'partnerName',
      label: '代理店名',
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
      key: 'partnerSalutation',
      label: '呼称',
      width: 150,
      sortable: true,
      edit: { type: 'text', placeholder: '例：〇〇商事' },
    },
    {
      key: 'partnerTierNumber',
      label: '階層番号',
      width: 100,
      sortable: true,
    },
    {
      key: 'partnerTier',
      label: '階層',
      width: 130,
      sortable: true,
    },
    {
      key: 'parentPartnerName',
      label: '親代理店',
      width: 180,
      sortable: false,
      defaultVisible: false,
      render: (value) => value ? String(value) : '-',
    },
    {
      key: 'partnerType',
      label: '種別',
      width: 110,
      sortable: true,
      edit: { type: 'select', options: PARTNER_TYPE_OPTIONS },
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
        endpoint: (row) => row.representativeId ? `/partners/${row.id}/contacts/${row.representativeId}` : '',
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
        endpoint: (row) => row.primaryContactId ? `/partners/${row.id}/contacts/${row.primaryContactId}` : '',
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
        endpoint: (row) => row.primaryContactId ? `/partners/${row.id}/contacts/${row.primaryContactId}` : '',
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
        endpoint: (row) => row.primaryContactId ? `/partners/${row.id}/contacts/${row.primaryContactId}` : '',
        field: 'contactEmail',
      },
    },

    // ===== その他フィールド =====
    {
      key: 'partnerPostalCode',
      label: '郵便番号',
      width: 110,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'text', placeholder: '000-0000' },
    },
    {
      key: 'partnerAddress',
      label: '住所',
      minWidth: 200,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'text', placeholder: '都道府県・市区町村・番地' },
    },
    {
      key: 'partnerPhone',
      label: '電話番号',
      width: 140,
      sortable: true,
      edit: { type: 'phone', placeholder: '03-0000-0000' },
    },
    {
      key: 'partnerFax',
      label: 'FAX',
      width: 140,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'phone', placeholder: '03-0000-0000' },
    },
    {
      key: 'partnerEmail',
      label: 'メール',
      width: 200,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'email', placeholder: 'info@example.com' },
    },
    {
      key: 'partnerWebsite',
      label: 'Webサイト',
      width: 120,
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
      key: 'partnerEstablishedDate',
      label: '設立日',
      width: 130,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'date' },
    },
    {
      key: 'partnerCorporateNumber',
      label: '法人番号',
      width: 150,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'text', placeholder: '13桁の数字' },
    },
    {
      key: 'partnerInvoiceNumber',
      label: 'インボイス番号',
      width: 160,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'text', placeholder: 'T + 13桁の数字' },
    },
    {
      key: 'partnerCapital',
      label: '資本金',
      width: 140,
      align: 'right',
      sortable: true,
      defaultVisible: false,
      edit: { type: 'number', placeholder: '0' },
      render: (v) => (v != null ? `${Number(v).toLocaleString()}円` : '-'),
    },
    {
      key: 'partnerBpFormUrl',
      label: 'BP申込書',
      width: 120,
      sortable: false,
      defaultVisible: false,
      render: (v) => (v ? 'あり' : '-'),
    },
    {
      key: 'partnerFolderUrl',
      label: 'フォルダURL',
      width: 120,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'url', placeholder: 'https://drive.example.com/...' },
    },
    {
      key: 'partnerNotes',
      label: '備考',
      width: 200,
      sortable: true,
      defaultVisible: false,
      edit: { type: 'textarea' },
    },
    {
      key: 'partnerIsActive',
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
    placeholder: '代理店名・代理店コード・担当者名で検索...',
    fields: ['partnerName', 'partnerCode', 'contactName'],
    debounceMs: 300,
  },
  filters: [
    {
      key: 'partnerType',
      label: '種別',
      type: 'multi-select',
      options: PARTNER_TYPE_OPTIONS,
    },
    {
      key: 'partnerTier',
      label: '階層',
      type: 'multi-select',
      optionsEndpoint: '/partners/filter-options',
    },
    {
      key: 'industryId',
      label: '業種',
      type: 'multi-select',
      optionsEndpoint: '/partners/filter-options',
    },
    {
      key: 'isActive',
      label: '状態',
      type: 'boolean',
      trueLabel: '有効',
      falseLabel: '無効',
    },
    {
      key: 'partnerAddress',
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
      key: 'partnerEstablishedDate',
      label: '設立日',
      type: 'date-range',
    },
  ],
  defaultSort: { field: 'partnerCode', direction: 'asc' },
  tableSettings: {
    persistKey: 'partner-list',
    defaultPageSize: 25,
    defaultDensity: 'normal',
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },
  detailPath: (id) => `/partners/${id}`,
  createPath: '/partners/new',
  batchActions: [
    {
      key: 'delete',
      label: '一括削除',
      variant: 'destructive',
      confirm: {
        title: '一括削除',
        message: (count: number) => `選択した ${count} 件の代理店を削除（無効化）しますか？この操作は管理者が復元できます。`,
      },
      apiEndpoint: '/partners/batch',
      onComplete: 'refresh',
    },
  ],
  csv: {
    importEnabled: true,
    exportEnabled: true,
    endpoint: '/partners/csv',
    columnKeyMap: {
      industryId: 'industryName',
      representativeName: 'representativeName',
      primaryContactName: 'primaryContactName',
      primaryContactPhone: 'primaryContactPhone',
      primaryContactEmail: 'primaryContactEmail',
    },
    templateColumns: [
      { key: 'partnerCode', label: '代理店コード', required: true, description: '一意の代理店コード（例: AG-0001）', example: 'AG-0001' },
      { key: 'partnerName', label: '代理店名', required: true, description: '代理店の正式名称', example: '株式会社サンプル代理店' },
      { key: 'partnerTier', label: '階層', description: '1次代理店 / 2次代理店 / 3次代理店', example: '1次代理店' },
      { key: 'partnerSalutation', label: '呼称', description: '社内での呼称', example: 'サンプル' },
      { key: 'partnerType', label: '種別', description: '法人 / 個人事業主 / 個人 / 確認中 / 未設定', example: '法人' },
      { key: 'partnerPostalCode', label: '郵便番号', description: 'ハイフンあり・なし両対応', example: '100-0001' },
      { key: 'partnerAddress', label: '住所', example: '東京都千代田区千代田1-1' },
      { key: 'partnerPhone', label: '電話番号', example: '03-1234-5678' },
      { key: 'partnerFax', label: 'FAX', example: '03-1234-5679' },
      { key: 'partnerEmail', label: 'メールアドレス', example: 'info@example.com' },
      { key: 'partnerWebsite', label: 'Webサイト', example: 'https://example.com' },
      { key: 'representativeName', label: '代表者名', description: '代表者の氏名', example: '山田太郎' },
      { key: 'representativePosition', label: '代表者役職', description: '代表者の役職', example: '代表取締役' },
      { key: 'primaryContactName', label: '主担当者名', description: '主担当者の氏名', example: '鈴木花子' },
      { key: 'primaryContactDepartment', label: '主担当者部署', description: '主担当者の部署', example: '営業部' },
      { key: 'primaryContactPhone', label: '主担当者TEL', description: '主担当者の電話番号', example: '03-1234-5680' },
      { key: 'primaryContactEmail', label: '主担当者メール', description: '主担当者のメールアドレス', example: 'suzuki@example.com' },
      { key: 'industryName', label: '業種', description: '業種マスタに登録済みの名称', example: '情報通信業' },
      { key: 'partnerEstablishedDate', label: '設立日', description: 'YYYY-MM-DD 形式', example: '2020-01-01' },
      { key: 'partnerCorporateNumber', label: '法人番号', description: '13桁の数字', example: '1234567890123' },
      { key: 'partnerInvoiceNumber', label: 'インボイス番号', description: 'T + 13桁の数字', example: 'T1234567890123' },
      { key: 'partnerCapital', label: '資本金', description: '数値（円）', example: '10000000' },
      { key: 'partnerFolderUrl', label: 'フォルダURL', example: '' },
      { key: 'partnerNotes', label: '備考', example: '' },
      { key: 'partnerIsActive', label: '有効フラグ', description: '1=有効、0=無効', example: '1' },
    ],
  },
};

// ============================================
// 代理店詳細 Config
// ============================================

export const partnerDetailConfig: EntityDetailConfig = {
  entityType: 'partner',
  apiEndpoint: (id) => `/partners/${id}`,
  title: (data) => data.partnerName as string,
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
              { key: 'partnerCode', label: '代理店コード', type: 'text' },
              { key: 'partnerType', label: '種別', type: 'text' },
              { key: 'partnerName', label: '代理店名', type: 'text', colSpan: 2 },
              { key: 'partnerSalutation', label: '呼称', type: 'text' },
              { key: 'partnerTier', label: '階層', type: 'text' },
              { key: 'partnerTierNumber', label: '階層番号', type: 'text' },
              {
                key: 'parentId',
                label: '親代理店',
                type: 'text',
                render: (_value, data) => {
                  const name = data.parentPartnerName as string | null;
                  const code = data.parentPartnerCode as string | null;
                  if (!name) return '-';
                  return `${name} (${code})`;
                },
              },
            ],
          },
          {
            title: '連絡先',
            columns: 2,
            fields: [
              { key: 'partnerPostalCode', label: '郵便番号', type: 'text' },
              { key: 'partnerPhone', label: '電話番号', type: 'phone' },
              { key: 'partnerAddress', label: '住所', type: 'text', colSpan: 2 },
              { key: 'partnerFax', label: 'FAX', type: 'phone' },
              { key: 'partnerEmail', label: 'メール', type: 'email' },
              { key: 'partnerWebsite', label: 'Webサイト', type: 'url' },
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
              { key: 'partnerEstablishedDate', label: '設立日', type: 'date' },
              { key: 'partnerCorporateNumber', label: '法人番号', type: 'text' },
              { key: 'partnerInvoiceNumber', label: 'インボイス番号', type: 'text' },
              { key: 'partnerCapital', label: '資本金', type: 'currency' },
            ],
          },
          {
            title: 'その他',
            columns: 1,
            fields: [
              {
                key: 'partnerBpFormUrl',
                label: 'BP申込書',
                type: 'url',
                colSpan: 2,
              },
              { key: 'partnerFolderUrl', label: 'フォルダURL', type: 'url', colSpan: 2 },
              { key: 'partnerNotes', label: '備考', type: 'text', colSpan: 2 },
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
        apiEndpoint: (parentId: string) => `/partners/${parentId}/contacts`,
      },
    },
    {
      key: 'bankAccounts',
      label: '口座情報',
      component: 'custom',
      config: {},
    },
    {
      key: 'partnerGroup',
      label: '代理店グループ',
      component: 'custom',
      config: {},
    },
    {
      key: 'projects',
      label: '関連案件',
      component: 'custom',
      config: {},
    },
    {
      key: 'businesses',
      label: '関連事業',
      component: 'custom',
      config: {},
    },
    {
      key: 'invoices',
      label: '支払明細書',
      component: 'custom',
      config: {},
    },
  ],
  actions: {
    edit: true,
    delete: true,
    restore: {
      activeField: 'partnerIsActive',
      apiEndpoint: (id) => `/partners/${id}/restore`,
      requiredRole: ['admin'],
    },
  },
};

// ============================================
// 代理店フォーム Config
// ============================================

export const partnerFormConfig: EntityFormConfig = {
  entityType: 'partner',
  apiEndpoint: '/partners',
  title: { create: '代理店新規登録', edit: '代理店編集' },
  sections: [
    {
      title: '基本情報',
      columns: 2,
      fields: [
        {
          key: 'partnerType',
          label: '種別',
          type: 'select',
          required: true,
          options: PARTNER_TYPE_OPTIONS,
        },
        {
          key: 'parentId',
          label: '親代理店',
          type: 'partner-select',
          description: '未選択の場合は1次代理店になります',
          partnerSelect: {
            candidatesEndpoint: '/partners/candidates',
            parentTierMapping: {},
          },
        },
        {
          key: 'partnerTier',
          label: '階層',
          type: 'readonly',
          description: '親代理店から自動決定されます',
        },
        {
          key: 'partnerName',
          label: '代理店名',
          type: 'text',
          required: true,
          placeholder: '例：株式会社〇〇',
          colSpan: 2,
          duplicateCheck: {
            endpoint: '/partners',
            labelField: 'partnerName',
            comboFields: [{ formKey: 'partnerPhone', paramKey: 'phone' }],
          },
        },
        {
          key: 'partnerSalutation',
          label: '呼称',
          type: 'text',
          placeholder: '例：〇〇商事（社内での呼称）',
          colSpan: 2,
        },
      ],
    },
    {
      title: '連絡先',
      columns: 2,
      fields: [
        { key: 'partnerPostalCode', label: '郵便番号', type: 'text', placeholder: '000-0000' },
        { key: 'partnerPhone', label: '電話番号', type: 'phone', placeholder: '03-0000-0000' },
        { key: 'partnerAddress', label: '住所', type: 'text', placeholder: '都道府県・市区町村・番地', colSpan: 2 },
        { key: 'partnerFax', label: 'FAX', type: 'phone', placeholder: '03-0000-0000' },
        { key: 'partnerEmail', label: 'メールアドレス', type: 'email', placeholder: 'info@example.com' },
        { key: 'partnerWebsite', label: 'Webサイト', type: 'url', placeholder: 'https://example.com' },
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
        { key: 'partnerEstablishedDate', label: '設立日', type: 'date' },
        { key: 'partnerCorporateNumber', label: '法人番号', type: 'text', placeholder: '13桁の数字' },
        { key: 'partnerInvoiceNumber', label: 'インボイス登録番号', type: 'text', placeholder: 'T + 13桁の数字' },
        { key: 'partnerCapital', label: '資本金（円）', type: 'number', placeholder: '0' },
      ],
    },
    {
      title: 'その他',
      columns: 1,
      fields: [
        {
          key: 'partnerBpFormUrl',
          label: 'BP申込書',
          type: 'file-upload',
          fileUpload: {
            directory: 'bp-forms',
            accept: 'application/pdf',
            description: 'PDF, 5MB以内',
            keyField: 'partnerBpFormKey',
          },
          colSpan: 1,
        },
        { key: 'partnerFolderUrl', label: 'フォルダURL', type: 'url', placeholder: 'https://drive.example.com/...', colSpan: 1 },
        { key: 'partnerNotes', label: '備考', type: 'textarea', placeholder: '備考・メモを入力...', colSpan: 1 },
      ],
    },
  ],
  validationSchema: z.object({
    partnerName: z.string().min(1, '代理店名は必須です').max(200, '代理店名は200文字以内で入力してください'),
    partnerTier: z.string().max(50).optional().nullable(),
    parentId: z.number().int().positive().optional().nullable(),
    partnerSalutation: z.string().max(100, '呼称は100文字以内で入力してください').optional().nullable(),
    partnerType: z.enum(['法人', '個人事業主', '個人', '確認中', '未設定']).default('未設定'),
    partnerPostalCode: z.string().max(10).optional().nullable(),
    partnerAddress: z.string().optional().nullable(),
    partnerPhone: z.string().max(20).optional().nullable(),
    partnerFax: z.string().max(20).optional().nullable(),
    partnerEmail: z.string().email('有効なメールアドレスを入力してください').optional().nullable().or(z.literal('')),
    partnerWebsite: z.string().url('有効なURLを入力してください').optional().nullable().or(z.literal('')),
    industryId: z.number().int().positive().optional().nullable(),
    partnerEstablishedDate: z.string().optional().nullable(),
    partnerCorporateNumber: z.string().regex(/^\d{13}$/, '法人番号は13桁の数字で入力してください').optional().nullable().or(z.literal('')),
    partnerInvoiceNumber: z.string().regex(/^T\d{13}$/, 'インボイス番号は「T」+13桁の数字で入力してください').optional().nullable().or(z.literal('')),
    partnerCapital: z.number().int().min(0, '資本金は0以上で入力してください').optional().nullable(),
    partnerBpFormUrl: z.string().optional().nullable().or(z.literal('')),
    partnerBpFormKey: z.string().optional().nullable(),
    partnerFolderUrl: z.string().url('有効なURLを入力してください').optional().nullable().or(z.literal('')),
    partnerNotes: z.string().optional().nullable(),
  }),
  defaultValues: {
    partnerTier: '1次代理店',
  },
  redirectAfterSave: (id) => `/partners/${id}`,
  warnOnLeave: true,
};
