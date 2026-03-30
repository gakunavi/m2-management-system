import type { EntityListConfig } from '@/types/config';

// ============================================
// 会計パイプライン一覧 Config
// ============================================

export const accountingPipelineListConfig: EntityListConfig = {
  entityType: 'accounting-pipeline',
  apiEndpoint: '/accounting-pipelines',
  title: '会計パイプライン',
  inlineEditable: true,
  patchEndpoint: (id) => `/accounting-pipelines/${id}`,
  createPath: '/accounting/new',
  columns: [
    {
      key: 'project.projectNo',
      label: 'MO番号',
      width: 120,
      sortable: true,
      group: '案件情報',
      render: (value: unknown, row: Record<string, unknown>) => {
        const project = row.project as { projectNo?: string } | null;
        return project?.projectNo ?? '-';
      },
    },
    {
      key: 'project.customerName',
      label: '顧客名',
      minWidth: 160,
      sortable: true,
      group: '案件情報',
      render: (value: unknown, row: Record<string, unknown>) => {
        const project = row.project as { customerName?: string } | null;
        return project?.customerName ?? '-';
      },
    },
    {
      key: 'project.partnerName',
      label: '代理店名',
      minWidth: 160,
      sortable: true,
      group: '案件情報',
      render: (value: unknown, row: Record<string, unknown>) => {
        const project = row.project as { partnerName?: string } | null;
        return project?.partnerName ?? '-';
      },
    },
    {
      key: 'revenueType',
      label: '報酬タイプ',
      width: 110,
      sortable: true,
      group: '売上情報',
      render: (value: unknown) => value === 'SHOT' ? 'ショット' : 'ストック',
    },
    {
      key: 'unitPrice',
      label: '単価',
      width: 130,
      sortable: true,
      group: '売上情報',
      edit: { type: 'number' },
      render: (value: unknown) => typeof value === 'number' ? `¥${value.toLocaleString()}` : '-',
    },
    {
      key: 'quantity',
      label: '個数',
      width: 80,
      sortable: true,
      group: '売上情報',
      edit: { type: 'number' },
    },
    {
      key: 'totalAmount',
      label: '売上金額',
      width: 150,
      sortable: true,
      group: '売上情報',
      render: (value: unknown) => typeof value === 'number' ? `¥${value.toLocaleString()}` : '-',
    },
    {
      key: 'billingCycle',
      label: '着金サイクル',
      width: 120,
      group: '売上情報',
      edit: { type: 'text', placeholder: '例: 毎月' },
    },
    {
      key: 'latestEntryDate',
      label: '直近着金日',
      width: 120,
      sortable: true,
      group: '着金情報',
    },
    {
      key: 'entryCount',
      label: '着金回数',
      width: 90,
      group: '着金情報',
    },
  ],
  search: {
    placeholder: 'MO番号・顧客名・代理店名で検索...',
    fields: ['projectNo', 'customerName', 'partnerName'],
    debounceMs: 300,
  },
  filters: [
    {
      key: 'revenueType',
      label: '報酬タイプ',
      type: 'select',
      options: [
        { value: 'SHOT', label: 'ショット' },
        { value: 'STOCK', label: 'ストック' },
      ],
    },
  ],
  defaultSort: { field: 'createdAt', direction: 'desc' },
  tableSettings: {
    persistKey: 'accounting-pipeline-list',
    defaultPageSize: 25,
    defaultDensity: 'normal',
    columnReorderEnabled: true,
    columnToggleEnabled: true,
  },
  detailPath: (id: number) => `/accounting/${id}`,
};
