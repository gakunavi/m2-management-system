'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef as TanstackColumnDef,
  type VisibilityState,
  type ColumnOrderState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpDown, ArrowUp, ArrowDown, GripVertical, ExternalLink, Pin } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ColumnSettingsPanel } from './column-settings-panel';
import { FilterPanel } from './filter-bar';
import { EditableCell } from './editable-cell';
import type { ColumnDef, EntityListConfig, FilterDef } from '@/types/config';
import type { SortItem } from '@/types/api';
import type { useTablePreferences } from '@/hooks/use-table-preferences';
import type { useInlineCellEdit } from '@/hooks/use-inline-cell-edit';

// ============================================
// ドラッグ可能な列ヘッダー
// ============================================

interface DraggableHeaderProps {
  id: string;
  label: string;
  sortable?: boolean;
  isSorted: 'asc' | 'desc' | false;
  sortPriority: number | null;
  onSort?: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  isLocked?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
}

function DraggableHeader({
  id,
  label,
  sortable,
  isSorted,
  sortPriority,
  onSort,
  onResizeStart,
  isLocked,
  isPinned,
  onTogglePin,
}: DraggableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !!isLocked || !!isPinned });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 w-full select-none relative group"
    >
      {!isLocked && !isPinned && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      <span
        className={cn(
          'flex-1 truncate text-xs font-medium',
          sortable && 'cursor-pointer hover:text-foreground',
        )}
        onClick={sortable ? onSort : undefined}
      >
        {label}
        {sortable && (
          <span className="inline-flex ml-0.5 items-center gap-px">
            {isSorted === 'asc' ? (
              <ArrowUp className="h-3 w-3" />
            ) : isSorted === 'desc' ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />
            )}
            {sortPriority !== null && sortPriority > 0 && (
              <span className="text-[10px] text-muted-foreground font-normal leading-none">
                {sortPriority}
              </span>
            )}
          </span>
        )}
      </span>
      {/* ピン留めボタン */}
      {onTogglePin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={cn(
            'shrink-0 mr-1 transition-opacity',
            isPinned
              ? 'text-primary opacity-100'
              : 'text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100',
          )}
          title={isPinned ? '列の固定を解除' : '列を固定'}
        >
          <Pin className="h-3 w-3" />
        </button>
      )}
      {/* リサイズハンドル */}
      <div
        onMouseDown={onResizeStart}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100"
      />
    </div>
  );
}

// ============================================
// SpreadsheetTable
// ============================================

interface SpreadsheetTableProps {
  columns: ColumnDef[];
  data: Record<string, unknown>[];
  config: EntityListConfig;
  sortItems: SortItem[];
  onSort: (field: string) => void;
  loading?: boolean;
  preferences: ReturnType<typeof useTablePreferences>['preferences'];
  savePreferences: ReturnType<typeof useTablePreferences>['savePreferences'];
  updateCell: ReturnType<typeof useInlineCellEdit>['updateCell'];
  queryKey: unknown[];
  filters?: FilterDef[];
  activeFilters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  onClearFilters?: () => void;
  selectedIds?: Set<number>;
  onSelectRow?: (id: number, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
}

export function SpreadsheetTable({
  columns: configColumns,
  data,
  config,
  sortItems,
  onSort,
  loading,
  preferences,
  savePreferences,
  updateCell,
  queryKey,
  filters,
  activeFilters,
  onFilterChange,
  onClearFilters,
  selectedIds,
  onSelectRow,
  onSelectAll,
}: SpreadsheetTableProps) {
  const router = useRouter();
  const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);
  const hasSelection = selectedIds !== undefined && onSelectRow !== undefined;

  // ============================================
  // 初期状態
  // ============================================

  const defaultColumnVisibility = useMemo<VisibilityState>(() => {
    const vis: VisibilityState = {};
    configColumns.forEach((col) => {
      if (col.defaultVisible === false) vis[col.key] = false;
    });
    return vis;
  }, [configColumns]);

  const defaultColumnOrder = useMemo<ColumnOrderState>(() => {
    const prefix = hasSelection ? ['_select', '_open'] : ['_open'];
    return [...prefix, ...configColumns.map((c) => c.key)];
  }, [configColumns, hasSelection]);

  const defaultColumnSizing = useMemo<ColumnSizingState>(() => {
    const sizing: ColumnSizingState = {};
    configColumns.forEach((col) => {
      if (col.width) sizing[col.key] = col.width;
    });
    return sizing;
  }, [configColumns]);

  // ============================================
  // ピン留め — ローカル state で即時反映
  // ============================================

  const [pinnedCols, setPinnedCols] = useState<string[]>(
    () => preferences?.columnPinning?.left ?? [],
  );

  // DB から復元されたら同期
  useEffect(() => {
    const fromDb = preferences?.columnPinning?.left ?? [];
    setPinnedCols(fromDb);
  }, [preferences?.columnPinning]);

  /** ピン留めトグル: ローカル即時更新 + DB保存 */
  const handleTogglePin = useCallback(
    (colId: string) => {
      setPinnedCols((prev) => {
        const next = prev.includes(colId)
          ? prev.filter((id) => id !== colId)
          : [...prev, colId];
        // DB保存（バックグラウンド）
        savePreferences({
          columnOrder: preferences?.columnOrder ?? defaultColumnOrder,
          columnVisibility: preferences?.columnVisibility ?? defaultColumnVisibility,
          columnWidths: preferences?.columnWidths ?? defaultColumnSizing,
          sortState: preferences?.sortState ?? [],
          columnPinning: { left: next },
        });
        return next;
      });
    },
    [preferences, defaultColumnOrder, defaultColumnVisibility, defaultColumnSizing, savePreferences],
  );

  /** ピン留めセルの sticky スタイルを返す。非ピン列は undefined */
  const getPinnedStyle = useCallback(
    (colId: string, visibleCols: { id: string; getSize: () => number }[]): React.CSSProperties | undefined => {
      const idx = pinnedCols.indexOf(colId);
      if (idx < 0) return undefined;

      let left = 0;
      for (let i = 0; i < idx; i++) {
        const col = visibleCols.find((c) => c.id === pinnedCols[i]);
        if (col) left += col.getSize();
      }

      return {
        position: 'sticky',
        left,
        zIndex: 10,
        boxShadow: idx === pinnedCols.length - 1
          ? '2px 0 4px -2px rgba(0,0,0,0.1)'
          : undefined,
      };
    },
    [pinnedCols],
  );

  // ============================================
  // TanStack Table 列定義
  // ============================================

  const tanstackColumns = useMemo<TanstackColumnDef<Record<string, unknown>>[]>(() => {
    const prefixCols: TanstackColumnDef<Record<string, unknown>>[] = [];

    if (hasSelection) {
      prefixCols.push({
        id: '_select',
        header: '',
        size: 36,
        enableHiding: false,
        enableResizing: false,
        cell: ({ row }) => {
          const rowId = row.original.id as number;
          return (
            <div className="flex items-center justify-center w-full h-full">
              <Checkbox
                checked={selectedIds.has(rowId)}
                onCheckedChange={(checked) => onSelectRow?.(rowId, checked === true)}
                aria-label={`行 ${rowId} を選択`}
              />
            </div>
          );
        },
      });
    }

    prefixCols.push({
      id: '_open',
      header: '',
      size: 36,
      enableHiding: false,
      enableResizing: false,
      cell: ({ row }) => (
        <button
          className="flex items-center justify-center w-full h-full text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            router.push(config.detailPath(row.original.id as number));
          }}
          title="詳細を開く"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      ),
    });

    const dataCols = configColumns.map((col): TanstackColumnDef<Record<string, unknown>> => ({
      id: col.key,
      accessorKey: col.key,
      header: col.label,
      size: col.width ?? col.minWidth ?? 120,
      minSize: col.minWidth ?? 60,
      enableHiding: !col.locked,
      enableResizing: true,
      cell: ({ row }) => {
        const rowData = row.original;
        const cellValue = rowData[col.key];
        const rowId = rowData.id as number;
        const version = rowData.version as number;
        const canCustomEdit = col.customPatch ? !!col.customPatch.endpoint(rowData) : true;
        const effectiveEditConfig = canCustomEdit ? col.edit : undefined;

        return (
          <EditableCell
            value={cellValue}
            editConfig={effectiveEditConfig}
            render={col.render}
            row={rowData}
            align={col.align}
            onCommit={async (newValue) => {
              await updateCell({
                rowId,
                field: col.key,
                value: newValue,
                version,
                queryKey,
                customPatch: col.customPatch,
                row: col.customPatch ? rowData : undefined,
              });
            }}
          />
        );
      },
    }));

    return [...prefixCols, ...dataCols];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configColumns, config, router, updateCell, queryKey, hasSelection, selectedIds]);

  // ============================================
  // TanStack Table インスタンス（ピン留めは自前管理のため含めない）
  // ============================================

  const table = useReactTable({
    data,
    columns: tanstackColumns,
    state: {
      columnVisibility: preferences?.columnVisibility ?? defaultColumnVisibility,
      columnOrder: preferences?.columnOrder ?? defaultColumnOrder,
      columnSizing: preferences?.columnWidths ?? defaultColumnSizing,
    },
    onColumnVisibilityChange: (updater) => {
      const current = preferences?.columnVisibility ?? defaultColumnVisibility;
      const next = typeof updater === 'function' ? updater(current) : updater;
      savePreferences({
        columnOrder: preferences?.columnOrder ?? defaultColumnOrder,
        columnVisibility: next,
        columnWidths: preferences?.columnWidths ?? defaultColumnSizing,
        sortState: preferences?.sortState ?? [],
        columnPinning: preferences?.columnPinning ?? { left: [] },
      });
    },
    onColumnOrderChange: (updater) => {
      const current = preferences?.columnOrder ?? defaultColumnOrder;
      const next = typeof updater === 'function' ? updater(current) : updater;
      savePreferences({
        columnOrder: next,
        columnVisibility: preferences?.columnVisibility ?? defaultColumnVisibility,
        columnWidths: preferences?.columnWidths ?? defaultColumnSizing,
        sortState: preferences?.sortState ?? [],
        columnPinning: preferences?.columnPinning ?? { left: [] },
      });
    },
    onColumnSizingChange: (updater) => {
      const current = preferences?.columnWidths ?? defaultColumnSizing;
      const next = typeof updater === 'function' ? updater(current) : updater;
      savePreferences({
        columnOrder: preferences?.columnOrder ?? defaultColumnOrder,
        columnVisibility: preferences?.columnVisibility ?? defaultColumnVisibility,
        columnWidths: next,
        sortState: preferences?.sortState ?? [],
        columnPinning: preferences?.columnPinning ?? { left: [] },
      });
    },
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    manualSorting: true,
    manualPagination: true,
  });

  // ============================================
  // リセット
  // ============================================

  const handleReset = useCallback(() => {
    setPinnedCols([]);
    savePreferences({
      columnOrder: defaultColumnOrder,
      columnVisibility: defaultColumnVisibility,
      columnWidths: defaultColumnSizing,
      sortState: [],
      columnPinning: { left: [] },
    });
  }, [defaultColumnOrder, defaultColumnVisibility, defaultColumnSizing, savePreferences]);

  // ============================================
  // ドラッグ＆ドロップ（列並べ替え）
  // ============================================

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnOrder = table.getState().columnOrder;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = columnOrder.indexOf(active.id as string);
        const newIndex = columnOrder.indexOf(over.id as string);
        const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
        table.setColumnOrder(newOrder);
      }
    },
    [columnOrder, table],
  );

  // ============================================
  // 列リサイズ
  // ============================================

  const handleResizeStart = useCallback(
    (colId: string, startX: number, startWidth: number) => {
      resizingRef.current = { colId, startX, startWidth };
    },
    [],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { colId, startX, startWidth } = resizingRef.current;
      const delta = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + delta);
      table.setColumnSizing((prev) => ({ ...prev, [colId]: newWidth }));
    };
    const handleMouseUp = () => { resizingRef.current = null; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [table]);

  // ============================================
  // レンダリング
  // ============================================

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const visibleColumnIds = visibleColumns.map((c) => c.id);

  return (
    <div className="flex flex-col gap-2">
      {/* ツールバー */}
      <div className="flex items-center justify-end gap-2">
        {filters && filters.length > 0 && onFilterChange && onClearFilters && (
          <FilterPanel
            filters={filters}
            activeFilters={activeFilters ?? {}}
            onFilterChange={onFilterChange}
            onClearAll={onClearFilters}
          />
        )}
        <ColumnSettingsPanel
          table={table}
          onReset={handleReset}
          pinnedCols={pinnedCols}
          onTogglePin={handleTogglePin}
        />
      </div>

      {/* テーブル本体 */}
      <div className="overflow-auto rounded-md border">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full caption-bottom text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="bg-muted/50 sticky top-0 z-20">
              {headerGroups.map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <SortableContext
                    items={visibleColumnIds}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header) => {
                      const colKey = header.column.id;
                      const configCol = configColumns.find((c) => c.key === colKey);
                      const colWidth = header.getSize();
                      const sortIndex = sortItems.findIndex((s) => s.field === colKey);
                      const sortItem = sortIndex >= 0 ? sortItems[sortIndex] : null;
                      const pinStyle = getPinnedStyle(colKey, visibleColumns);
                      const isPrefix = colKey === '_select' || colKey === '_open';

                      return (
                        <th
                          key={header.id}
                          style={{ width: colWidth, minWidth: colWidth, ...pinStyle }}
                          className={cn(
                            'h-9 px-2 border-r border-b last:border-r-0 text-left align-middle',
                            pinStyle ? 'bg-muted z-30' : 'bg-muted/50',
                          )}
                        >
                          {header.isPlaceholder ? null : colKey === '_select' ? (
                          hasSelection && onSelectAll ? (
                            <div className="flex items-center justify-center w-full">
                              <Checkbox
                                checked={
                                  data.length > 0 && data.every((r) => selectedIds.has(r.id as number))
                                    ? true
                                    : data.some((r) => selectedIds.has(r.id as number))
                                      ? 'indeterminate'
                                      : false
                                }
                                onCheckedChange={(checked) => onSelectAll(checked === true)}
                                aria-label="全選択"
                              />
                            </div>
                          ) : null
                        ) : colKey === '_open' ? null : (
                            <DraggableHeader
                              id={colKey}
                              label={
                                typeof header.column.columnDef.header === 'string'
                                  ? header.column.columnDef.header
                                  : colKey
                              }
                              sortable={configCol?.sortable}
                              isSorted={sortItem ? sortItem.direction : false}
                              sortPriority={sortItems.length > 1 && sortIndex >= 0 ? sortIndex + 1 : null}
                              onSort={() => onSort(colKey)}
                              onResizeStart={(e) => {
                                handleResizeStart(colKey, e.clientX, colWidth);
                              }}
                              isLocked={configCol?.locked}
                              isPinned={pinnedCols.includes(colKey)}
                              onTogglePin={isPrefix ? undefined : () => handleTogglePin(colKey)}
                            />
                          )}
                        </th>
                      );
                    })}
                  </SortableContext>
                </tr>
              ))}
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b">
                    {visibleColumnIds.map((id) => (
                      <td key={id} className="h-9 px-2 border-r last:border-r-0">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumnIds.length}
                    className="h-24 text-center text-muted-foreground text-sm"
                  >
                    データがありません
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b hover:bg-muted/30 transition-colors group/row"
                  >
                    {row.getVisibleCells().map((cell) => {
                      const pinStyle = getPinnedStyle(cell.column.id, visibleColumns);
                      return (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize(), ...pinStyle }}
                          className={cn(
                            'h-9 border-r last:border-r-0 p-0 overflow-hidden',
                            cell.column.id === '_open' && 'text-center',
                            pinStyle && 'bg-background group-hover/row:bg-muted',
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DndContext>
      </div>
    </div>
  );
}
