'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Search,
  GripVertical,
  Eye,
  EyeOff,
  Pin,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  RotateCcw,
} from 'lucide-react';
import type { ColumnDef, PersistedColumnSettings } from '@/types/config';
import type { SortItem } from '@/types/api';

// ============================================
// 型定義
// ============================================

interface TableDisplaySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnDef[];
  preferences: PersistedColumnSettings | null;
  defaultColumnOrder: string[];
  defaultColumnVisibility: Record<string, boolean>;
  defaultColumnSizing: Record<string, number>;
  currentSortItems: SortItem[];
  currentPageSize: number;
  pinnedCols: string[];
  onSave: (settings: {
    columnOrder: string[];
    columnVisibility: Record<string, boolean>;
    columnWidths: Record<string, number>;
    sortState: SortItem[];
    columnPinning: { left: string[] };
    pageSize: number;
  }) => void;
  onSortChange: (sortItems: SortItem[]) => void;
  onPageSizeChange: (size: number) => void;
}

type TabId = 'basic' | 'columns' | 'sort';

// ============================================
// ドラッグ可能な列アイテム
// ============================================

interface SortableColumnItemProps {
  id: string;
  label: string;
  isSelected: boolean;
  isPinned: boolean;
  onToggleSelect: () => void;
  onTogglePin: () => void;
  isLocked?: boolean;
}

function SortableColumnItem({
  id,
  label,
  isSelected,
  isPinned,
  onToggleSelect,
  onTogglePin,
  isLocked,
}: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !!isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md border text-sm transition-colors',
        isDragging && 'shadow-md bg-background',
        isSelected
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-background',
      )}
    >
      {!isLocked && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleSelect()}
        className="shrink-0"
      />
      <span className="flex-1 truncate">{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        className={cn(
          'shrink-0 transition-colors',
          isPinned
            ? 'text-primary hover:text-primary/80'
            : 'text-muted-foreground/30 hover:text-muted-foreground',
        )}
        title={isPinned ? '固定解除' : '列を固定'}
      >
        <Pin className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ============================================
// メインモーダル
// ============================================

export function TableDisplaySettingsModal({
  open,
  onOpenChange,
  columns,
  preferences,
  defaultColumnOrder,
  defaultColumnVisibility,
  defaultColumnSizing,
  currentSortItems,
  currentPageSize,
  pinnedCols: initialPinnedCols,
  onSave,
  onSortChange,
  onPageSizeChange,
}: TableDisplaySettingsModalProps) {
  // ============================================
  // ローカル state（Save前に確定しない）
  // ============================================

  const [activeTab, setActiveTab] = useState<TabId>('columns');

  // 列順序・表示・ピン留め
  const [localColumnOrder, setLocalColumnOrder] = useState<string[]>([]);
  const [localColumnVisibility, setLocalColumnVisibility] = useState<Record<string, boolean>>({});
  const [localPinnedCols, setLocalPinnedCols] = useState<string[]>([]);

  // ソート
  const [localSortItems, setLocalSortItems] = useState<SortItem[]>([]);

  // ページサイズ
  const [localPageSize, setLocalPageSize] = useState(25);

  // 列名検索
  const [searchQuery, setSearchQuery] = useState('');

  // 一括選択
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  // リセット確認
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // ============================================
  // Dialog open 時にローカル state を初期化
  // ※ useEffect で open prop を監視する。Radix Dialog の onOpenChange は
  //   内部操作（閉じる）でしか発火せず、外部から open=true をセットした
  //   場合は呼ばれないため。
  // ============================================

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // preferences からローカル state にコピー
      const prefixCols = defaultColumnOrder.filter((id) => id.startsWith('_'));
      const dataCols = (preferences?.columnOrder ?? defaultColumnOrder).filter(
        (id) => !id.startsWith('_'),
      );
      // 新規列を末尾追加
      const validSet = new Set(columns.map((c) => c.key));
      const filteredDataCols = dataCols.filter((id) => validSet.has(id));
      const missingCols = columns
        .map((c) => c.key)
        .filter((key) => !filteredDataCols.includes(key));
      setLocalColumnOrder([...prefixCols, ...filteredDataCols, ...missingCols]);

      const vis: Record<string, boolean> = {};
      columns.forEach((col) => {
        const savedVis = preferences?.columnVisibility;
        if (savedVis && col.key in savedVis) {
          vis[col.key] = savedVis[col.key];
        } else {
          vis[col.key] = col.defaultVisible !== false;
        }
      });
      setLocalColumnVisibility(vis);

      setLocalPinnedCols(initialPinnedCols);
      setLocalSortItems([...currentSortItems]);
      setLocalPageSize(currentPageSize);
      setSearchQuery('');
      setBulkSelectedIds(new Set());
      setShowResetConfirm(false);
      setActiveTab('columns');
    }
    prevOpenRef.current = open;
  }, [open, columns, preferences, defaultColumnOrder, initialPinnedCols, currentSortItems, currentPageSize]);

  // ============================================
  // 派生データ
  // ============================================

  // config columns (prefix除外)
  const dataColumnIds = useMemo(
    () => localColumnOrder.filter((id) => !id.startsWith('_')),
    [localColumnOrder],
  );

  const visibleColumnIds = useMemo(
    () => dataColumnIds.filter((id) => localColumnVisibility[id] !== false),
    [dataColumnIds, localColumnVisibility],
  );

  const hiddenColumnIds = useMemo(
    () => dataColumnIds.filter((id) => localColumnVisibility[id] === false),
    [dataColumnIds, localColumnVisibility],
  );

  const columnMap = useMemo(() => {
    const map = new Map<string, ColumnDef>();
    columns.forEach((col) => map.set(col.key, col));
    return map;
  }, [columns]);

  // 検索フィルタ
  const filteredVisibleIds = useMemo(() => {
    if (!searchQuery.trim()) return visibleColumnIds;
    const q = searchQuery.toLowerCase();
    return visibleColumnIds.filter((id) => {
      const col = columnMap.get(id);
      return (
        col?.label.toLowerCase().includes(q) || id.toLowerCase().includes(q)
      );
    });
  }, [visibleColumnIds, searchQuery, columnMap]);

  const filteredHiddenIds = useMemo(() => {
    if (!searchQuery.trim()) return hiddenColumnIds;
    const q = searchQuery.toLowerCase();
    return hiddenColumnIds.filter((id) => {
      const col = columnMap.get(id);
      return (
        col?.label.toLowerCase().includes(q) || id.toLowerCase().includes(q)
      );
    });
  }, [hiddenColumnIds, searchQuery, columnMap]);

  // ソート可能な列
  const sortableColumns = useMemo(
    () =>
      columns.filter(
        (col) =>
          col.sortable &&
          localColumnVisibility[col.key] !== false &&
          !localSortItems.some((s) => s.field === col.key),
      ),
    [columns, localColumnVisibility, localSortItems],
  );

  // ============================================
  // ハンドラ: 列タブ
  // ============================================

  const handleShowColumn = useCallback((colId: string) => {
    setLocalColumnVisibility((prev) => ({ ...prev, [colId]: true }));
  }, []);

  const handleTogglePin = useCallback((colId: string) => {
    setLocalPinnedCols((prev) =>
      prev.includes(colId)
        ? prev.filter((id) => id !== colId)
        : [...prev, colId],
    );
  }, []);

  const handleToggleBulkSelect = useCallback((colId: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  }, []);

  const handleBulkSelectAll = useCallback(() => {
    const allFiltered = new Set(filteredVisibleIds);
    const allSelected = filteredVisibleIds.every((id) =>
      bulkSelectedIds.has(id),
    );
    if (allSelected) {
      setBulkSelectedIds((prev) => {
        const next = new Set(prev);
        allFiltered.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setBulkSelectedIds((prev) => {
        const next = new Set(prev);
        allFiltered.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [filteredVisibleIds, bulkSelectedIds]);

  const handleBulkHide = useCallback(() => {
    setLocalColumnVisibility((prev) => {
      const next = { ...prev };
      bulkSelectedIds.forEach((id) => {
        const col = columnMap.get(id);
        if (!col?.locked) next[id] = false;
      });
      return next;
    });
    setBulkSelectedIds(new Set());
  }, [bulkSelectedIds, columnMap]);

  // D&D — MouseSensor + TouchSensor を使用
  // （PointerSensor は setPointerCapture を使い、Radix Dialog のポータル内で競合するため）
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleColumnDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setLocalColumnOrder((prev) => {
        // prefix列を維持したまま data列のみ並び替え
        const prefixCols = prev.filter((id) => id.startsWith('_'));
        const dataCols = prev.filter((id) => !id.startsWith('_'));
        const oldIndex = dataCols.indexOf(active.id as string);
        const newIndex = dataCols.indexOf(over.id as string);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return [...prefixCols, ...arrayMove(dataCols, oldIndex, newIndex)];
      });
    },
    [],
  );

  // ============================================
  // ハンドラ: ソートタブ
  // ============================================

  const handleAddSort = useCallback(
    (field: string) => {
      setLocalSortItems((prev) => [...prev, { field, direction: 'asc' as const }]);
    },
    [],
  );

  const handleRemoveSort = useCallback((index: number) => {
    setLocalSortItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleToggleSortDirection = useCallback(
    (index: number) => {
      setLocalSortItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? { ...item, direction: item.direction === 'asc' ? 'desc' as const : 'asc' as const }
            : item,
        ),
      );
    },
    [],
  );

  const handleMoveSortUp = useCallback((index: number) => {
    if (index <= 0) return;
    setLocalSortItems((prev) => arrayMove(prev, index, index - 1));
  }, []);

  const handleMoveSortDown = useCallback(
    (index: number) => {
      setLocalSortItems((prev) => {
        if (index >= prev.length - 1) return prev;
        return arrayMove(prev, index, index + 1);
      });
    },
    [],
  );

  // ============================================
  // 保存 / リセット
  // ============================================

  const handleSave = useCallback(() => {
    onSave({
      columnOrder: localColumnOrder,
      columnVisibility: localColumnVisibility,
      columnWidths: preferences?.columnWidths ?? defaultColumnSizing,
      sortState: localSortItems,
      columnPinning: { left: localPinnedCols },
      pageSize: localPageSize,
    });
    onSortChange(localSortItems);
    onPageSizeChange(localPageSize);
    onOpenChange(false);
  }, [
    localColumnOrder,
    localColumnVisibility,
    localSortItems,
    localPinnedCols,
    localPageSize,
    preferences?.columnWidths,
    defaultColumnSizing,
    onSave,
    onSortChange,
    onPageSizeChange,
    onOpenChange,
  ]);

  const handleReset = useCallback(() => {
    setLocalColumnOrder([...defaultColumnOrder]);

    const vis: Record<string, boolean> = { ...defaultColumnVisibility };
    // defaultColumnVisibility に未登録の列はデフォルト表示
    columns.forEach((col) => {
      if (!(col.key in vis)) vis[col.key] = true;
    });
    setLocalColumnVisibility(vis);
    setLocalPinnedCols([]);
    setLocalSortItems([]);
    setLocalPageSize(25);
    setShowResetConfirm(false);
  }, [defaultColumnOrder, defaultColumnVisibility, columns]);

  // ============================================
  // タブ定義
  // ============================================

  const tabs: { id: TabId; label: string }[] = [
    { id: 'basic', label: '基本設定' },
    { id: 'columns', label: '列の表示・順序' },
    { id: 'sort', label: 'ソート設定' },
  ];

  // ============================================
  // レンダリング
  // ============================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>テーブル表示設定</DialogTitle>
        </DialogHeader>

        {/* タブ */}
        <div className="flex border-b px-6 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {/* 基本設定タブ */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  表示件数
                </label>
                <div className="flex gap-2">
                  {[10, 25, 50, 100].map((size) => (
                    <Button
                      key={size}
                      variant={localPageSize === size ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLocalPageSize(size)}
                    >
                      {size}件
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 列の表示・順序タブ */}
          {activeTab === 'columns' && (
            <div className="space-y-3">
              {/* 検索 */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="列を検索..."
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {/* 一括操作 */}
              {filteredVisibleIds.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={
                      filteredVisibleIds.length > 0 &&
                      filteredVisibleIds.every((id) => bulkSelectedIds.has(id))
                    }
                    onCheckedChange={() => handleBulkSelectAll()}
                  />
                  <span className="text-muted-foreground">全選択</span>
                  {bulkSelectedIds.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs ml-auto"
                      onClick={handleBulkHide}
                    >
                      <EyeOff className="h-3 w-3 mr-1" />
                      選択した列を非表示 ({bulkSelectedIds.size})
                    </Button>
                  )}
                </div>
              )}

              {/* 2カラムレイアウト */}
              <div className="grid grid-cols-2 gap-4">
                {/* 左: 表示中の列 */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    表示中の列
                  </h4>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleColumnDragEnd}
                  >
                    <SortableContext
                      items={filteredVisibleIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1" style={{ touchAction: 'none' }}>
                        {filteredVisibleIds.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-4 text-center">
                            {searchQuery
                              ? '一致する列がありません'
                              : '表示中の列がありません'}
                          </p>
                        ) : (
                          filteredVisibleIds.map((colId) => {
                            const col = columnMap.get(colId);
                            if (!col) return null;
                            return (
                              <SortableColumnItem
                                key={colId}
                                id={colId}
                                label={col.label}
                                isSelected={bulkSelectedIds.has(colId)}
                                isPinned={localPinnedCols.includes(colId)}
                                onToggleSelect={() =>
                                  handleToggleBulkSelect(colId)
                                }
                                onTogglePin={() => handleTogglePin(colId)}
                                isLocked={col.locked}
                              />
                            );
                          })
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>

                {/* 右: 非表示の列 */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    非表示の列
                  </h4>
                  <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1">
                    {filteredHiddenIds.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        {searchQuery
                          ? '一致する列がありません'
                          : '非表示の列がありません'}
                      </p>
                    ) : (
                      filteredHiddenIds.map((colId) => {
                        const col = columnMap.get(colId);
                        if (!col) return null;
                        return (
                          <div
                            key={colId}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed text-sm text-muted-foreground"
                          >
                            <span className="flex-1 truncate">{col.label}</span>
                            <button
                              onClick={() => handleShowColumn(colId)}
                              className="shrink-0 hover:text-foreground transition-colors"
                              title="表示する"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ソート設定タブ */}
          {activeTab === 'sort' && (
            <div className="space-y-4">
              {/* 現在のソート */}
              {localSortItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  ソートが設定されていません
                </p>
              ) : (
                <div className="space-y-2">
                  {localSortItems.map((item, index) => {
                    const col = columnMap.get(item.field);
                    return (
                      <div
                        key={item.field}
                        className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm"
                      >
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                          {index + 1}
                        </span>
                        <span className="flex-1 truncate font-medium">
                          {col?.label ?? item.field}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleToggleSortDirection(index)}
                        >
                          {item.direction === 'asc' ? '昇順' : '降順'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleMoveSortUp(index)}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleMoveSortDown(index)}
                          disabled={index === localSortItems.length - 1}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveSort(index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ソート追加 */}
              {sortableColumns.length > 0 && (
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value) handleAddSort(value);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="ソートを追加..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sortableColumns.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex items-center w-full">
            {showResetConfirm ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  リセットしますか？
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReset}
                >
                  リセット
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResetConfirm(false)}
                >
                  キャンセル
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
                className="text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                デフォルトに戻す
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                キャンセル
              </Button>
              <Button onClick={handleSave}>保存</Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
