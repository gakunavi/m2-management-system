'use client';

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { formatCurrency } from '@/components/features/dashboard/chart-config';
import type { PortalProject, PortalFieldDefinition } from '@/types/dashboard';

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Props {
  projects: PortalProject[] | undefined;
  meta: PaginationMeta | undefined;
  fieldDefinitions?: PortalFieldDefinition[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

const FIXED_COLUMNS = [
  { key: 'customerName', label: '顧客名', sortable: true, hideOnMobile: false },
  { key: 'businessName', label: '事業', sortable: true, hideOnMobile: false },
  { key: 'projectSalesStatus', label: 'ステータス', sortable: true, hideOnMobile: false },
  { key: 'projectExpectedCloseMonth', label: '予定月', sortable: true, hideOnMobile: false },
  { key: 'amount', label: '金額', sortable: false, hideOnMobile: false },
  { key: 'projectAssignedUserName', label: '担当者', sortable: true, hideOnMobile: true },
  { key: 'updatedAt', label: '更新日', sortable: true, hideOnMobile: true },
] as const;

function formatCustomFieldValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return '-';
  if (type === 'checkbox') return value ? '✓' : '-';
  if (type === 'number' && typeof value === 'number') return value.toLocaleString();
  return String(value);
}

export function PortalProjectList({
  projects,
  meta,
  fieldDefinitions = [],
  sortBy,
  sortOrder,
  onSort,
  onPageChange,
  isLoading,
}: Props) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">案件一覧</h3>
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">案件一覧</h3>
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          案件がありません
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">案件一覧</h3>
          {meta && (
            <span className="text-sm text-muted-foreground">
              全{meta.total}件
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-b bg-muted/50">
              {FIXED_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap ${
                    col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''
                  } ${col.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortBy === col.key ? (
                      sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                    ) : col.sortable ? (
                      <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
                    ) : null}
                  </span>
                </th>
              ))}
              {fieldDefinitions.map((fd) => {
                const sortKey = `customData_${fd.key}`;
                return (
                  <th
                    key={fd.key}
                    className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                    onClick={() => onSort(sortKey)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {fd.label}
                      {sortBy === sortKey ? (
                        sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.projectNo} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 whitespace-nowrap">{p.customerName}</td>
                <td className="px-4 py-3 whitespace-nowrap">{p.businessName}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: p.projectSalesStatusColor
                        ? `${p.projectSalesStatusColor}20`
                        : '#6b728020',
                      color: p.projectSalesStatusColor || '#6b7280',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: p.projectSalesStatusColor || '#6b7280' }}
                    />
                    {p.projectSalesStatusLabel}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {p.projectExpectedCloseMonth ?? '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  {p.amount !== null ? formatCurrency(p.amount, true) : '-'}
                </td>
                <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {p.projectAssignedUserName ?? '-'}
                </td>
                <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {new Date(p.updatedAt).toLocaleDateString('ja-JP')}
                </td>
                {fieldDefinitions.map((fd) => (
                  <td key={fd.key} className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatCustomFieldValue(p.customFields?.[fd.key], fd.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      {meta && meta.totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-5 py-3 border-t">
          <span className="text-sm text-muted-foreground">
            {(meta.page - 1) * meta.pageSize + 1}-
            {Math.min(meta.page * meta.pageSize, meta.total)}件 / {meta.total}件
          </span>
          <div className="flex gap-1">
            <button
              className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-50 hover:bg-muted"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              前へ
            </button>
            <button
              className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-50 hover:bg-muted"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
            >
              次へ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
