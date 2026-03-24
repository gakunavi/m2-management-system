import { z } from 'zod';
import type { EntityListConfig, EntityDetailConfig, EntityFormConfig } from '@/types/config';

// ============================================
// 事業マスタ一覧 Config
// ============================================

export const businessListConfig: EntityListConfig = {
  entityType: 'business',
  apiEndpoint: '/businesses',
  title: '事業マスタ一覧',
  inlineEditable: true,
  patchEndpoint: (id) => `/businesses/${id}`,
  columns: [
    {
      key: 'businessCode',
      label: '事業コード',
      width: 120,
      sortable: true,
      edit: {
        type: 'text',
        placeholder: '例：moag',
        validate: (v) =>
          typeof v === 'string' && v.trim().length > 0
            ? { success: true }
            : { success: false, error: '必須' },
      },
    },
    {
      key: 'businessName',
      label: '事業名',
      minWidth: 200,
      sortable: true,
      edit: {
        type: 'text',
        placeholder: '例：MOAG事業',
        validate: (v) =>
          typeof v === 'string' && v.trim().length > 0
            ? { success: true }
            : { success: false, error: '必須' },
      },
    },
    {
      key: 'businessDescription',
      label: '説明',
      minWidth: 200,
      sortable: false,
      defaultVisible: false,
      edit: { type: 'textarea' },
    },
    {
      key: 'businessSortOrder',
      label: '表示順',
      width: 100,
      align: 'right',
      sortable: true,
      edit: { type: 'number', placeholder: '0' },
    },
    {
      key: 'businessIsActive',
      label: 'ステータス',
      width: 90,
      align: 'center',
      sortable: false,
      edit: { type: 'checkbox' },
      render: (value) => (value ? '有効' : '無効'),
    },
    { key: 'updatedAt', label: '更新日時', width: 150, sortable: true },
    { key: 'createdAt', label: '作成日時', width: 150, sortable: true, defaultVisible: false },
  ],
  search: {
    placeholder: '事業名・事業コードで検索...',
    fields: ['businessName', 'businessCode'],
    debounceMs: 300,
  },
  filters: [
    {
      key: 'isActive',
      label: '状態',
      type: 'boolean',
      trueLabel: '有効',
      falseLabel: '無効',
    },
    {
      key: 'createdAt',
      label: '作成日',
      type: 'date-range',
    },
  ],
  defaultSort: { field: 'businessSortOrder', direction: 'asc' },
  tableSettings: {
    persistKey: 'business-list',
    defaultPageSize: 25,
    defaultDensity: 'normal',
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },
  detailPath: (id) => `/businesses/${id}`,
  createPath: '/businesses/new',
  batchActions: [
    {
      key: 'delete',
      label: '一括削除',
      variant: 'destructive',
      confirm: {
        title: '一括削除',
        message: (count: number) => `選択した ${count} 件の事業を削除（無効化）しますか？この操作は管理者が復元できます。`,
      },
      apiEndpoint: '/businesses/batch',
      onComplete: 'refresh',
    },
  ],
  csv: {
    importEnabled: true,
    exportEnabled: true,
    endpoint: '/businesses/csv',
    templateColumns: [
      { key: 'businessCode', label: '事業コード', required: true, description: '一意の事業コード（例: SMP）', example: 'SMP' },
      { key: 'businessName', label: '事業名', required: true, description: '事業の名称', example: 'MOAG事業' },
      { key: 'businessDescription', label: '説明', description: '事業の説明', example: '省エネ機器の営業管理' },
      { key: 'businessSortOrder', label: '表示順', description: '表示順（数値）', example: '1' },
      { key: 'businessIsActive', label: '有効フラグ', description: '1=有効、0=無効', example: '1' },
    ],
  },
};

// ============================================
// 事業詳細 Config
// ============================================

export const businessDetailConfig: EntityDetailConfig = {
  entityType: 'business',
  basePath: '/businesses',
  apiEndpoint: (id) => `/businesses/${id}`,
  title: (data) => data.businessName as string,
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
              { key: 'businessCode', label: '事業コード', type: 'text' },
              { key: 'businessName', label: '事業名', type: 'text', colSpan: 2 },
              { key: 'businessDescription', label: '説明', type: 'text', colSpan: 2 },
            ],
          },
          {
            title: '設定',
            columns: 2,
            fields: [
              { key: 'businessSortOrder', label: '表示順', type: 'number' },
              { key: 'businessIsActive', label: '有効', type: 'boolean' },
            ],
          },
        ],
      },
    },
    {
      key: 'statusDefinitions',
      label: '営業ステータス定義',
      component: 'custom',
      config: {},
    },
    {
      key: 'movementTemplates',
      label: 'ムーブメント定義',
      component: 'custom',
      config: {},
    },
    {
      key: 'projectFields',
      label: '案件フィールド定義',
      component: 'custom',
      config: {},
    },
    {
      key: 'revenueRecognition',
      label: 'KPI定義',
      component: 'custom',
      config: {},
    },
    {
      key: 'fileCategories',
      label: 'ファイルカテゴリ',
      component: 'custom',
      config: {},
    },
    {
      key: 'salesTargets',
      label: '売上目標',
      component: 'custom',
      config: {},
    },
  ],
  actions: {
    edit: true,
    delete: true,
    restore: {
      activeField: 'businessIsActive',
      apiEndpoint: (id) => `/businesses/${id}/restore`,
      requiredRole: ['admin'],
    },
  },
};

// ============================================
// 事業フォーム Config
// ============================================

export const businessFormConfig: EntityFormConfig = {
  entityType: 'business',
  apiEndpoint: '/businesses',
  title: { create: '事業新規登録', edit: '事業編集' },
  sections: [
    {
      title: '基本情報',
      columns: 2,
      fields: [
        {
          key: 'businessCode',
          label: '事業コード',
          type: 'text',
          required: true,
          placeholder: '例：moag',
        },
        {
          key: 'businessName',
          label: '事業名',
          type: 'text',
          required: true,
          placeholder: '例：MOAG事業',
          colSpan: 2,
          duplicateCheck: {
            endpoint: '/businesses',
            labelField: 'businessName',
          },
        },
        {
          key: 'businessDescription',
          label: '説明',
          type: 'textarea',
          placeholder: '事業の説明を入力...',
          colSpan: 2,
        },
      ],
    },
    {
      title: '設定',
      columns: 2,
      fields: [
        {
          key: 'businessSortOrder',
          label: '表示順',
          type: 'number',
          placeholder: '0',
        },
      ],
    },
  ],
  validationSchema: z.object({
    businessCode: z.string().min(1, '事業コードは必須です').max(20, '事業コードは20文字以内で入力してください'),
    businessName: z.string().min(1, '事業名は必須です').max(100, '事業名は100文字以内で入力してください'),
    businessDescription: z.string().optional().nullable(),
    businessSortOrder: z.number().int().min(0, '0以上の整数を入力してください').optional().default(0),
  }),
  redirectAfterSave: (id) => `/businesses/${id}`,
  warnOnLeave: true,
};
