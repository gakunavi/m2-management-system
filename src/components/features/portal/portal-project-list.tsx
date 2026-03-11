'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
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
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  GripVertical,
  SlidersHorizontal,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/components/features/dashboard/chart-config';
import { useTablePreferences } from '@/hooks/use-table-preferences';
import type { PortalProject, PortalFieldDefinition } from '@/types/dashboard';

// ============================================
// 型定義
// ============================================

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

/** 統合カラム定義 */
interface UnifiedColumn {
  key: string;
  label: string;
  sortable: boolean;
  hideOnMobile: boolean;
  /** データが無い場合に自動非表示 */
  hideWhenEmpty?: boolean;
  /** カスタムフィールドかどうか */
  isCustom?: boolean;
  /** カスタムフィールド型 */
  customType?: string;
}

// ============================================
// 固定カラム定義
// ============================================

const BASE_FIXED_COLUMNS: UnifiedColumn[] = [
  { key: 'customerName', label: '顧客名', sortable: true, hideOnMobile: false },
  { key: 'partnerName', label: '代理店名', sortable: true, hideOnMobile: false },
  { key: 'projectSalesStatus', label: 'ステータス', sortable: true, hideOnMobile: false },
  { key: 'projectExpectedCloseMonth', label: '予定月', sortable: true, hideOnMobile: false },
  { key: 'amount', label: '金額', sortable: false, hideOnMobile: false, hideWhenEmpty: true },
  { key: 'projectAssignedUserName', label: '担当者', sortable: true, hideOnMobile: true },
  { key: 'updatedAt', label: '更新日', sortable: true, hideOnMobile: true },
];

// ============================================
// ヘルパー関数
// ============================================

function formatCustomFieldValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return '-';
  if (type === 'checkbox') return value ? '✓' : '-';
  if ((type === 'number' || type === 'formula') && typeof value === 'number') return value.toLocaleString();
  return String(value);
}

/** セルの値をレンダリング */
function renderCellValue(col: UnifiedColumn, project: PortalProject): React.ReactNode {
  if (col.isCustom) {
    return (
      <span className="text-muted-foreground">
        {formatCustomFieldValue(project.customFields?.[col.key], col.customType ?? 'text')}
      </span>
    );
  }

  switch (col.key) {
    case 'customerName':
      return project.customerName;
    case 'partnerName':
      return project.partnerName || '-';
    case 'projectSalesStatus':
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: project.projectSalesStatusColor
              ? `${project.projectSalesStatusColor}20`
              : '#6b728020',
            color: project.projectSalesStatusColor || '#6b7280',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: project.projectSalesStatusColor || '#6b7280' }}
          />
          {project.projectSalesStatusLabel}
        </span>
      );
    case 'projectExpectedCloseMonth':
      return <span className="text-muted-foreground">{project.projectExpectedCloseMonth ?? '-'}</span>;
    case 'amount':
      return (
        <span className="text-right block">
          {project.amount !== null ? formatCurrency(project.amount, true) : '-'}
        </span>
      );
    case 'projectAssignedUserName':
      return <span className="text-muted-foreground">{project.projectAssignedUserName ?? '-'}</span>;
    case 'updatedAt':
      return <span className="text-muted-foreground">{new Date(project.updatedAt).toLocaleDateString('ja-JP')}</span>;
    default:
      return '-';
  }
}

// ============================================
// ドラッグ可能なヘッダー
// ============================================

interface SortableHeaderProps {
  id: string;
  label: string;
  sortable: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  sortKey: string;
  hideOnMobile: boolean;
}

function SortableHeader({ id, label, sortable, sortBy, sortOrder, onSort, sortKey, hideOnMobile }: SortableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap ${
        sortable ? 'cursor-pointer hover:text-foreground' : ''
      } ${hideOnMobile ? 'hidden sm:table-cell' : ''}`}
      onClick={() => sortable && onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1 group select-none">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span>{label}</span>
        {sortable && sortBy === sortKey ? (
          sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
        ) : sortable ? (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
        ) : null}
      </span>
    </th>
  );
}

// ============================================
// 列設定ドロップダウン
// ============================================

interface ColumnSettingsProps {
  columns: UnifiedColumn[];
  visibility: Record<string, boolean>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onReset: () => void;
}

function PortalColumnSettings({ columns, visibility, onToggle, onShowAll, onReset }: ColumnSettingsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="h-4 w-4" />
          列設定
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>列の表示/非表示</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((col) => {
          const isVisible = visibility[col.key] !== false;
          return (
            <DropdownMenuCheckboxItem
              key={col.key}
              checked={isVisible}
              onCheckedChange={() => onToggle(col.key)}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="flex items-center gap-2 w-full">
                <span className="flex-1 truncate">{col.label}</span>
                {isVisible ? (
                  <Eye className="h-3.5 w-3.5 text-muted-foreground/60" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground/30" />
                )}
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <div
          className="p-1 flex gap-1"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs"
            onClick={onShowAll}
          >
            全て表示
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs gap-1"
            onClick={onReset}
          >
            <RotateCcw className="h-3 w-3" />
            リセット
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================
// メインコンポーネント
// ============================================

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
  // ---- テーブル設定の永続化 ----
  const { preferences, savePreferences } = useTablePreferences('portal-projects');

  // ---- 全カラム定義を構築 ----
  const allColumns = useMemo<UnifiedColumn[]>(() => {
    // 金額列: 全プロジェクトに金額が無い場合は除外
    const hasAnyAmount = projects?.some((p) => p.amount !== null && p.amount !== undefined) ?? false;
    const fixedCols = BASE_FIXED_COLUMNS.filter((col) => {
      if (col.hideWhenEmpty && !hasAnyAmount) return false;
      return true;
    });

    const customCols: UnifiedColumn[] = fieldDefinitions.map((fd) => ({
      key: `customData_${fd.key}`,
      label: fd.label,
      sortable: true,
      hideOnMobile: false,
      isCustom: true,
      customType: fd.type,
    }));

    return [...fixedCols, ...customCols];
  }, [fieldDefinitions, projects]);

  // ---- デフォルトの列順 ----
  const defaultColumnOrder = useMemo(() => allColumns.map((c) => c.key), [allColumns]);

  // ---- 列順の管理（永続化設定を反映） ----
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnOrder);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  // 永続化設定の読み込み（初回のみ）
  useEffect(() => {
    if (preferences) {
      if (preferences.columnOrder?.length) {
        // 保存済み列順を既存列で調整（削除済み列を除外、新規列を末尾追加）
        const existingKeys = new Set(allColumns.map((c) => c.key));
        const reconciledOrder = preferences.columnOrder.filter((k) => existingKeys.has(k));
        const savedSet = new Set(reconciledOrder);
        const newKeys = allColumns.map((c) => c.key).filter((k) => !savedSet.has(k));
        setColumnOrder([...reconciledOrder, ...newKeys]);
      }
      if (preferences.columnVisibility) {
        setColumnVisibility(preferences.columnVisibility);
      }
    }
  }, [preferences]); // allColumns は意図的に除外（初回設定のみ）

  // allColumns が変わったら（カスタムフィールド追加/削除時）列順を自動調整
  useEffect(() => {
    setColumnOrder((prev) => {
      const existingKeys = new Set(allColumns.map((c) => c.key));
      // 削除されたキーを除外
      const filtered = prev.filter((k) => existingKeys.has(k));
      // 新規キーを末尾に追加
      const prevSet = new Set(filtered);
      const newKeys = allColumns.map((c) => c.key).filter((k) => !prevSet.has(k));
      if (newKeys.length === 0 && filtered.length === prev.length) return prev;
      return [...filtered, ...newKeys];
    });
  }, [allColumns]);

  // ---- 設定保存 ----
  const persistSettings = useCallback(
    (order: string[], vis: Record<string, boolean>) => {
      savePreferences({
        columnOrder: order,
        columnVisibility: vis,
        columnWidths: {},
        sortState: [],
      });
    },
    [savePreferences],
  );

  // ---- 表示列を計算 ----
  const visibleColumns = useMemo(() => {
    const colMap = new Map(allColumns.map((c) => [c.key, c]));
    return columnOrder
      .map((key) => colMap.get(key))
      .filter((c): c is UnifiedColumn => !!c && columnVisibility[c.key] !== false);
  }, [allColumns, columnOrder, columnVisibility]);

  // ---- dnd-kit ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setColumnOrder((prev) => {
        const oldIdx = prev.indexOf(String(active.id));
        const newIdx = prev.indexOf(String(over.id));
        if (oldIdx === -1 || newIdx === -1) return prev;
        const newOrder = arrayMove(prev, oldIdx, newIdx);
        persistSettings(newOrder, columnVisibility);
        return newOrder;
      });
    },
    [columnVisibility, persistSettings],
  );

  // ---- 列設定ハンドラ ----
  const handleToggleVisibility = useCallback(
    (key: string) => {
      setColumnVisibility((prev) => {
        const next = { ...prev, [key]: prev[key] === false ? true : false };
        // false のみ保存する（デフォルトは表示）
        const cleaned = Object.fromEntries(
          Object.entries(next).filter(([, v]) => v === false),
        );
        persistSettings(columnOrder, cleaned);
        return next;
      });
    },
    [columnOrder, persistSettings],
  );

  const handleShowAll = useCallback(() => {
    setColumnVisibility({});
    persistSettings(columnOrder, {});
  }, [columnOrder, persistSettings]);

  const handleReset = useCallback(() => {
    setColumnOrder(defaultColumnOrder);
    setColumnVisibility({});
    persistSettings(defaultColumnOrder, {});
  }, [defaultColumnOrder, persistSettings]);

  // ---- ローディング / 空状態 ----
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
          <div className="flex items-center gap-2">
            {meta && (
              <span className="text-sm text-muted-foreground">
                全{meta.total}件
              </span>
            )}
            <PortalColumnSettings
              columns={allColumns}
              visibility={columnVisibility}
              onToggle={handleToggleVisibility}
              onShowAll={handleShowAll}
              onReset={handleReset}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-b bg-muted/50">
                <SortableContext
                  items={visibleColumns.map((c) => c.key)}
                  strategy={horizontalListSortingStrategy}
                >
                  {visibleColumns.map((col) => {
                    const sortKey = col.isCustom ? col.key : col.key;
                    return (
                      <SortableHeader
                        key={col.key}
                        id={col.key}
                        label={col.label}
                        sortable={col.sortable}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={onSort}
                        sortKey={sortKey}
                        hideOnMobile={col.hideOnMobile}
                      />
                    );
                  })}
                </SortableContext>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.projectNo} className="border-b last:border-b-0 hover:bg-muted/30">
                  {visibleColumns.map((col) => {
                    // カスタムフィールドのセルレンダリングでは customData_ プレフィックスを除去
                    const renderCol = col.isCustom
                      ? { ...col, key: col.key.replace('customData_', '') }
                      : col;
                    return (
                      <td
                        key={col.key}
                        className={`px-4 py-3 whitespace-nowrap ${
                          col.hideOnMobile ? 'hidden sm:table-cell' : ''
                        }`}
                      >
                        {renderCellValue(renderCol, p)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </DndContext>
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
