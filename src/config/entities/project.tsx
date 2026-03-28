import Link from 'next/link';
import type { EntityListConfig, EntityDetailConfig, EntityFormConfig } from '@/types/config';
import { projectBaseSchema } from '@/lib/validations/project';

// ============================================
// 案件一覧 Config（ベース）
// ============================================

export const projectListConfig: EntityListConfig = {
  entityType: 'project',
  apiEndpoint: '/projects',
  title: '案件一覧',
  inlineEditable: true,
  patchEndpoint: (id) => `/projects/${id}`,

  columns: [
    // ── 案件基本情報 ──
    {
      key: 'projectNo',
      label: '案件番号',
      width: 130,
      sortable: true,
      group: '契約マスタ情報',
    },
    {
      key: 'customerName',
      label: '顧客',
      minWidth: 180,
      sortable: true,
      group: '契約マスタ情報',
      render: (_value, row) => {
        const customer = row.customer as { id?: number; customerName?: string } | null;
        if (!customer?.customerName) return '-';
        return (
          <Link
            href={`/customers/${customer.id}?from=/projects,案件一覧`}
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {customer.customerName}
          </Link>
        );
      },
    },
    {
      key: 'projectSalesStatus',
      label: '営業ステータス',
      width: 160,
      sortable: true,
      group: '契約マスタ情報',
      // options は useProjectConfig で注入
      edit: { type: 'select', options: [] },
      render: (_value, row) => {
        const label = row.projectSalesStatusLabel as string | null;
        if (label) {
          return label;
        }
        return (row.projectSalesStatus as string) ?? '-';
      },
    },
    {
      key: 'partnerName',
      label: '代理店',
      width: 180,
      sortable: true,
      group: '契約マスタ情報',
      render: (_value, row) => {
        const partner = row.partner as { id?: number; partnerName?: string } | null;
        if (!partner?.partnerName) return '-';
        return (
          <Link
            href={`/partners/${partner.id}?from=/projects,案件一覧`}
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {partner.partnerName}
          </Link>
        );
      },
    },
    {
      key: 'projectExpectedCloseMonth',
      label: '受注予定月',
      width: 130,
      sortable: true,
      group: '契約マスタ情報',
      edit: { type: 'month' },
    },
    {
      key: 'projectAssignedUserName',
      label: '担当者',
      width: 140,
      sortable: true,
      group: '契約マスタ情報',
      edit: { type: 'text' },
    },
    {
      key: 'projectRenovationNumber',
      label: '階層番号',
      width: 140,
      sortable: true,
      group: '契約マスタ情報',
      edit: { type: 'text' },
    },
    {
      key: 'projectNotes',
      label: '備考',
      width: 200,
      sortable: true,
      defaultVisible: false,
      group: '契約マスタ情報',
      edit: { type: 'textarea' },
    },
    {
      key: 'businessName',
      label: '事業',
      width: 140,
      sortable: true,
      defaultVisible: false,
      group: '契約マスタ情報',
      render: (_value, row) => {
        const biz = row.business as { businessName?: string } | null;
        return biz?.businessName ?? '-';
      },
    },
    {
      key: 'portalVisible',
      label: 'ポータル',
      width: 100,
      sortable: true,
      defaultVisible: false,
      group: '契約マスタ情報',
      edit: { type: 'checkbox' },
      render: (value) => {
        if (value === false) {
          return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">非表示</span>;
        }
        return '表示';
      },
    },
    // ── 顧客基本情報 ──
    {
      key: 'customerSalutation',
      label: '顧客呼称',
      width: 140,
      sortable: true,
      defaultVisible: false,
      group: '顧客マスタ情報',
      render: (_value, row) => {
        const c = row.customer as { customerSalutation?: string | null } | null;
        return c?.customerSalutation || '-';
      },
    },
    {
      key: 'customerType',
      label: '顧客種別',
      width: 110,
      sortable: true,
      defaultVisible: false,
      group: '顧客マスタ情報',
      render: (_value, row) => {
        const c = row.customer as { customerType?: string | null } | null;
        return c?.customerType || '-';
      },
    },
    {
      key: 'customerRepresentativeName',
      label: '顧客代表者',
      width: 140,
      sortable: false,
      defaultVisible: false,
      group: '顧客マスタ情報',
      render: (_value, row) => {
        const c = row.customer as { contacts?: { contactName: string }[] } | null;
        return c?.contacts?.[0]?.contactName || '-';
      },
    },
    {
      key: 'customerWebsite',
      label: '顧客WEBサイト',
      width: 160,
      sortable: true,
      defaultVisible: false,
      group: '顧客マスタ情報',
      render: (_value, row) => {
        const c = row.customer as { customerWebsite?: string | null } | null;
        if (!c?.customerWebsite) return '-';
        return (
          <a
            href={c.customerWebsite}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {c.customerWebsite}
          </a>
        );
      },
    },
    {
      key: 'customerFiscalMonth',
      label: '顧客決算月',
      width: 110,
      sortable: true,
      defaultVisible: false,
      group: '顧客マスタ情報',
      render: (_value, row) => {
        const c = row.customer as { customerFiscalMonth?: number | null } | null;
        return c?.customerFiscalMonth ? `${c.customerFiscalMonth}月` : '-';
      },
    },
    {
      key: 'customerFolderUrl',
      label: '顧客フォルダURL',
      width: 120,
      sortable: true,
      defaultVisible: false,
      group: '顧客マスタ情報',
      render: (_value, row) => {
        const c = row.customer as { customerFolderUrl?: string | null } | null;
        if (!c?.customerFolderUrl) return '-';
        return (
          <a
            href={c.customerFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm truncate block max-w-full"
            onClick={(e) => e.stopPropagation()}
            title={c.customerFolderUrl}
          >
            {c.customerFolderUrl}
          </a>
        );
      },
    },
    // ── 代理店基本情報 ──
    {
      key: 'partnerCode',
      label: '代理店コード',
      width: 130,
      sortable: true,
      defaultVisible: false,
      group: '代理店マスタ情報',
      render: (_value, row) => {
        const p = row.partner as { partnerCode?: string } | null;
        return p?.partnerCode || '-';
      },
    },
    {
      key: 'partnerSalutation',
      label: '代理店呼称',
      width: 140,
      sortable: true,
      defaultVisible: false,
      group: '代理店マスタ情報',
      render: (_value, row) => {
        const p = row.partner as { partnerSalutation?: string | null } | null;
        return p?.partnerSalutation || '-';
      },
    },
    {
      key: 'partnerFolderUrl',
      label: '代理店フォルダURL',
      width: 120,
      sortable: true,
      defaultVisible: false,
      group: '代理店マスタ情報',
      render: (_value, row) => {
        const p = row.partner as { partnerFolderUrl?: string | null } | null;
        if (!p?.partnerFolderUrl) return '-';
        return (
          <a
            href={p.partnerFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm truncate block max-w-full"
            onClick={(e) => e.stopPropagation()}
            title={p.partnerFolderUrl}
          >
            {p.partnerFolderUrl}
          </a>
        );
      },
    },
    // ── システム ──
    { key: 'updatedAt', label: '更新日時', width: 150, sortable: true, group: 'システム情報' },
    { key: 'createdAt', label: '作成日時', width: 150, sortable: true, defaultVisible: false, group: 'システム情報' },
  ],

  search: {
    placeholder: '案件番号・顧客名・代理店名・担当者名で検索...',
    fields: ['projectNo', 'customerName', 'partnerName', 'projectAssignedUserName'],
    debounceMs: 300,
  },

  filters: [
    {
      key: 'projectSalesStatus',
      label: '営業ステータス',
      type: 'multi-select',
      options: [], // useProjectConfig で注入
    },
    {
      key: 'projectAssignedUserName',
      label: '担当者',
      type: 'text',
    },
    {
      key: 'isActive',
      label: '状態',
      type: 'boolean',
      trueLabel: '有効',
      falseLabel: '削除済み',
    },
    {
      key: 'portalVisible',
      label: 'ポータル表示',
      type: 'boolean',
      trueLabel: '表示',
      falseLabel: '非表示',
    },
  ],

  defaultSort: { field: 'updatedAt', direction: 'desc' },

  tableSettings: {
    persistKey: 'project-list',
    defaultPageSize: 25,
    defaultDensity: 'normal',
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },

  detailPath: (id) => `/projects/${id}`,
  createPath: '/projects/new',

  batchActions: [
    {
      key: 'delete',
      label: '一括削除',
      variant: 'destructive',
      confirm: {
        title: '一括削除',
        message: (count: number) =>
          `選択した ${count} 件の案件を削除（無効化）しますか？`,
      },
      apiEndpoint: '/projects/batch',
      onComplete: 'refresh',
    },
  ],

  csv: {
    importEnabled: true,
    exportEnabled: true,
    endpoint: '/projects/csv',
    templateColumns: [
      { key: 'customerCode', label: '顧客コード', required: true, description: '顧客コードまたは顧客名のいずれか必須', example: 'CST-0001' },
      { key: 'customerName', label: '顧客名', required: false, description: '顧客コードが空の場合、名前で検索', example: '株式会社サンプル' },
      { key: 'partnerCode', label: '代理店コード', required: false, description: '代理店コードまたは代理店名（空欄可）', example: 'AG-0001' },
      { key: 'partnerName', label: '代理店名', required: false, description: '代理店コードが空の場合、名前で検索', example: '株式会社サンプル代理店' },
      { key: 'projectSalesStatus', label: '営業ステータス', required: true, description: '営業ステータスの表示名', example: '' },
      { key: 'projectExpectedCloseMonth', label: '受注予定月', required: false, description: 'YYYY-MM形式', example: '2026-06' },
      { key: 'projectAssignedUserName', label: '担当者名', required: false, description: '担当者名（自由記入）', example: '田中太郎' },
      { key: 'projectNotes', label: '備考', required: false, description: '備考テキスト', example: '初回提案予定' },
    ],
    columnKeyMap: {
      customerName: 'customerCode',
      partnerName: 'partnerCode',
      projectAssignedUserName: 'projectAssignedUserName',
      projectSalesStatus: 'projectSalesStatus',
    },
  },
};

// ============================================
// 案件詳細 Config（ベース）
// ============================================

export const projectDetailConfig: EntityDetailConfig = {
  entityType: 'project',
  apiEndpoint: (id) => `/projects/${id}`,
  title: (data) => data.projectNo as string,

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
              { key: 'projectNo', label: '案件番号', type: 'text' },
              { key: 'projectSalesStatus', label: '営業ステータス', type: 'text' },
              {
                key: 'customerId',
                label: '顧客',
                type: 'text',
                render: (_value, data) => {
                  const c = data.customer as { customerName?: string; customerCode?: string } | null;
                  return c ? `${c.customerName} (${c.customerCode})` : '-';
                },
              },
              {
                key: 'partnerId',
                label: '代理店',
                type: 'text',
                render: (_value, data) => {
                  const p = data.partner as { partnerName?: string; partnerCode?: string } | null;
                  return p ? `${p.partnerName} (${p.partnerCode})` : '-';
                },
              },
              { key: 'projectExpectedCloseMonth', label: '受注予定月', type: 'text' },
              { key: 'projectAssignedUserName', label: '担当者', type: 'text' },
              {
                key: 'businessId',
                label: '事業',
                type: 'text',
                render: (_value, data) => {
                  const b = data.business as { businessName?: string } | null;
                  return b?.businessName ?? '-';
                },
              },
              { key: 'projectRenovationNumber', label: '階層番号', type: 'text' },
              {
                key: 'customerSalutation',
                label: '顧客呼称',
                type: 'text',
                render: (_value, data) => {
                  const c = data.customer as { customerSalutation?: string | null } | null;
                  return c?.customerSalutation || '-';
                },
              },
              {
                key: 'customerType',
                label: '顧客種別',
                type: 'text',
                render: (_value, data) => {
                  const c = data.customer as { customerType?: string | null } | null;
                  return c?.customerType || '-';
                },
              },
              {
                key: 'customerRepresentativeName',
                label: '顧客代表者',
                type: 'text',
                render: (_value, data) => {
                  const c = data.customer as { contacts?: { contactName: string }[] } | null;
                  return c?.contacts?.[0]?.contactName || '-';
                },
              },
              {
                key: 'customerWebsite',
                label: '顧客WEBサイト',
                type: 'url',
                render: (_value, data) => {
                  const c = data.customer as { customerWebsite?: string | null } | null;
                  if (!c?.customerWebsite) return '-';
                  return (
                    <a
                      href={c.customerWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {c.customerWebsite}
                    </a>
                  );
                },
              },
              {
                key: 'customerFiscalMonth',
                label: '顧客決算月',
                type: 'text',
                render: (_value, data) => {
                  const c = data.customer as { customerFiscalMonth?: number | null } | null;
                  return c?.customerFiscalMonth ? `${c.customerFiscalMonth}月` : '-';
                },
              },
              {
                key: 'customerFolderUrl',
                label: '顧客フォルダURL',
                type: 'text',
                render: (_value, data) => {
                  const c = data.customer as { customerFolderUrl?: string | null } | null;
                  if (!c?.customerFolderUrl) return '-';
                  return (
                    <a
                      href={c.customerFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {c.customerFolderUrl}
                    </a>
                  );
                },
              },
              {
                key: 'partnerCode',
                label: '代理店コード',
                type: 'text',
                render: (_value, data) => {
                  const p = data.partner as { partnerCode?: string } | null;
                  return p?.partnerCode || '-';
                },
              },
              {
                key: 'partnerSalutation',
                label: '代理店呼称',
                type: 'text',
                render: (_value, data) => {
                  const p = data.partner as { partnerSalutation?: string | null } | null;
                  return p?.partnerSalutation || '-';
                },
              },
              {
                key: 'partnerFolderUrl',
                label: '代理店フォルダURL',
                type: 'text',
                render: (_value, data) => {
                  const p = data.partner as { partnerFolderUrl?: string | null } | null;
                  if (!p?.partnerFolderUrl) return '-';
                  return (
                    <a
                      href={p.partnerFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {p.partnerFolderUrl}
                    </a>
                  );
                },
              },
              {
                key: 'portalVisible',
                label: 'ポータル表示',
                type: 'text',
                render: (value) => {
                  if (value === false) {
                    return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">非表示</span>;
                  }
                  return '表示';
                },
              },
              { key: 'projectNotes', label: '備考', type: 'text', colSpan: 2 },
            ],
          },
          // 事業固有フィールドセクションは useProjectConfig で動的追加
        ],
      },
    },
    {
      key: 'movements',
      label: 'ムーブメント',
      component: 'custom',
      config: {},
    },
    {
      key: 'files',
      label: 'ファイル',
      component: 'custom',
      config: {},
    },
    {
      key: 'reminders',
      label: 'リマインダー',
      component: 'custom',
      config: {},
    },
    {
      key: 'comments',
      label: 'コメント',
      component: 'custom',
      config: {},
    },
    {
      key: 'customerInfo',
      label: '顧客情報',
      component: 'custom',
      config: {},
    },
    {
      key: 'partnerInfo',
      label: '代理店情報',
      component: 'custom',
      config: {},
    },
    {
      key: 'otherProjects',
      label: 'その他案件',
      component: 'custom',
      config: {},
    },
  ],

  actions: {
    edit: true,
    delete: true,
    restore: {
      activeField: 'projectIsActive',
      apiEndpoint: (id) => `/projects/${id}/restore`,
      requiredRole: ['admin'],
    },
  },
};

// ============================================
// 案件フォーム Config（ベース）
// ============================================

export const projectFormConfig: EntityFormConfig = {
  entityType: 'project',
  apiEndpoint: '/projects',
  title: { create: '案件新規登録', edit: '案件編集' },

  sections: [
    {
      title: '基本情報',
      columns: 2,
      fields: [
        {
          key: 'customerId',
          label: '顧客',
          type: 'entity-select',
          required: true,
          entitySelect: {
            endpoint: '/customers',
            labelField: 'customerName',
            codeField: 'customerCode',
            searchPlaceholder: '顧客名・顧客コードで検索...',
          },
        },
        {
          key: 'partnerId',
          label: '代理店',
          type: 'entity-select',
          entitySelect: {
            endpoint: '/partners',
            labelField: 'partnerName',
            codeField: 'partnerCode',
            searchPlaceholder: '代理店名・代理店コードで検索...',
          },
        },
        {
          key: 'projectSalesStatus',
          label: '営業ステータス',
          type: 'select',
          required: true,
          options: [], // useProjectConfig で注入
          placeholder: 'ステータスを選択してください',
        },
        {
          key: 'projectExpectedCloseMonth',
          label: '受注予定月',
          type: 'month',
        },
        {
          key: 'projectAssignedUserName',
          label: '担当者',
          type: 'text',
          placeholder: '担当者名を入力',
        },
        {
          key: 'projectAssignedUserId',
          label: '担当ユーザー（アクセス制御用）',
          type: 'select',
          options: [], // API から動的取得
          placeholder: '紐付けるユーザーを選択',
          optionsEndpoint: '/users',
        },
        {
          key: 'projectRenovationNumber',
          label: '階層番号',
          type: 'text',
          placeholder: '階層番号を入力',
        },
        {
          key: 'portalVisible',
          label: 'ポータル表示',
          type: 'checkbox',
          description: 'OFFにすると代理店ポータルに表示されません',
        },
        {
          key: 'projectNotes',
          label: '備考',
          type: 'textarea',
          colSpan: 2,
          placeholder: '備考を入力...',
        },
      ],
    },
    // 事業固有フィールドセクションは useProjectConfig で動的追加
  ],

  defaultValues: { portalVisible: true },
  validationSchema: projectBaseSchema,
  redirectAfterSave: (id) => `/projects/${id}`,
  warnOnLeave: true,
};
