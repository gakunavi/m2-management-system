'use client';

import { cn } from '@/lib/utils';
import type { ColumnDef } from '@/types/config';
import type { SortItem } from '@/types/api';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DataTableProps {
  columns: ColumnDef[];
  data: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
  sortItems?: SortItem[];
  onSort?: (field: string) => void;
  loading?: boolean;
  /** 選択中の行 ID セット（一括操作用） */
  selectedIds?: Set<number>;
  onSelectRow?: (id: number, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
}

export function DataTable({
  columns,
  data,
  onRowClick,
  sortItems = [],
  onSort,
  loading,
  selectedIds,
  onSelectRow,
  onSelectAll,
}: DataTableProps) {
  const hasSelection = selectedIds !== undefined && onSelectRow !== undefined;
  const allSelected =
    hasSelection && data.length > 0 && data.every((row) => selectedIds.has(row.id as number));
  const someSelected = hasSelection && data.some((row) => selectedIds.has(row.id as number));

  const getSortIcon = (columnKey: string) => {
    const sortIndex = sortItems.findIndex((s) => s.field === columnKey);
    if (sortIndex < 0) {
      return <ArrowUpDown className="ml-1 h-4 w-4 text-muted-foreground/50" />;
    }
    const item = sortItems[sortIndex];
    return (
      <span className="inline-flex items-center gap-px ml-1">
        {item.direction === 'asc' ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
        {sortItems.length > 1 && (
          <span className="text-[10px] text-muted-foreground font-normal leading-none">
            {sortIndex + 1}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm max-h-[calc(100vh-300px)] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-20 bg-muted">
          <TableRow>
            {hasSelection && (
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(checked) => onSelectAll?.(checked === true)}
                  aria-label="全選択"
                />
              </TableHead>
            )}
            {columns.map((column) => (
              <TableHead
                key={column.key}
                style={{ width: column.width, minWidth: column.minWidth }}
                className={cn(
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                  column.sortable && 'cursor-pointer select-none',
                )}
                onClick={(e) => column.sortable && onSort?.(column.key, e.shiftKey)}
              >
                <div className="flex items-center">
                  {column.label}
                  {column.sortable && getSortIcon(column.key)}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {hasSelection && (
                  <TableCell>
                    <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            data.map((row, rowIndex) => {
              const rowId = row.id as number;
              const isSelected = hasSelection && selectedIds.has(rowId);
              return (
                <TableRow
                  key={rowId ?? rowIndex}
                  className={cn(
                    onRowClick && 'cursor-pointer hover:bg-muted/50',
                    isSelected && 'bg-primary/5',
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {hasSelection && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelectRow(rowId, checked === true)}
                        aria-label={`行 ${rowId} を選択`}
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        column.align === 'right' && 'text-right',
                        column.align === 'center' && 'text-center',
                      )}
                    >
                      {column.render
                        ? column.render(row[column.key], row)
                        : (row[column.key] as React.ReactNode) ?? '-'}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
