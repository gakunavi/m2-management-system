'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, List, LayoutGrid, Calendar, Search, ChevronDown, ChevronRight, X, Users, Settings, GripVertical } from 'lucide-react';
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useBusiness } from '@/hooks/use-business';
import { useTaskList, useTaskTags, useTaskDetail, useTaskBoards, useTaskBoardMutations, useTaskMutations, useTaskColumns, useTaskColumnMutations } from '@/hooks/use-tasks';
import { useDebounce } from '@/hooks/use-debounce';
import { TaskDetailPanel } from '@/components/features/task/task-detail-panel';
import { TaskCreateModal } from '@/components/features/task/task-create-modal';
import { TaskBoardSettingsPanel } from '@/components/features/task/task-board-settings-panel';
import { TaskKanbanView } from '@/components/features/task/task-kanban-view';
import { TaskCalendarView } from '@/components/features/task/task-calendar-view';
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '@/types/task';
import type { TaskListItem, TaskScope } from '@/types/task';

type ViewMode = 'list' | 'kanban' | 'calendar';

export function TasksClient() {
  const { currentBusiness } = useBusiness();
  const { reorderTasks } = useTaskMutations();

  // ビューモード
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [viewModeLoaded, setViewModeLoaded] = useState(false);

  // クライアントでlocalStorageから復元（hydrationミスマッチ防止）
  useEffect(() => {
    const saved = localStorage.getItem('task-view-mode') as ViewMode | null;
    if (saved && ['list', 'kanban', 'calendar'].includes(saved)) {
      setViewMode(saved);
    }
    setViewModeLoaded(true);
  }, []);

  // スコープ
  const [scope, setScope] = useState<TaskScope>('company');
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [showBoardSettings, setShowBoardSettings] = useState<number | null>(null);
  const [showCreateBoard, setShowCreateBoard] = useState(false);

  // ボード
  const { data: boards } = useTaskBoards();
  const { createBoard } = useTaskBoardMutations();

  // カラム（カンバン用）
  const { data: columnsData } = useTaskColumns(
    scope,
    scope === 'business' ? currentBusiness?.id : undefined,
    scope === 'board' && selectedBoardId ? selectedBoardId : undefined,
  );
  const { createColumn, updateColumn, deleteColumn, reorderColumns } = useTaskColumnMutations(
    scope,
    scope === 'business' ? currentBusiness?.id : undefined,
    scope === 'board' && selectedBoardId ? selectedBoardId : undefined,
  );
  const columns = columnsData ?? [];

  // カラム編集モーダル
  const [showColumnModal, setShowColumnModal] = useState<'create' | number | null>(null);

  // フィルター
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  const [assigneeSearchText, setAssigneeSearchText] = useState('');
  const [tagFilter, setTagFilter] = useState<number[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // ページネーション & ソート
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sort, setSort] = useState('sortOrder:asc');

  // 詳細パネル & 作成モーダル
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // タスク一覧取得
  const listParams = useMemo(() => ({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    sort,
    scope,
    businessId: scope === 'business' ? currentBusiness?.id : undefined,
    boardId: scope === 'board' && selectedBoardId ? selectedBoardId : undefined,
    status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
    priority: priorityFilter.length > 0 ? priorityFilter.join(',') : undefined,
    assigneeId: assigneeFilter ?? undefined,
    showArchived: showArchived ? 'true' : undefined,
    tagIds: tagFilter.length > 0 ? tagFilter.join(',') : undefined,
    parentOnly: true,
  }), [page, pageSize, debouncedSearch, sort, scope, currentBusiness?.id, selectedBoardId, statusFilter, priorityFilter, assigneeFilter, tagFilter, viewMode, showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: taskData, isLoading } = useTaskList(listParams);
  const { data: tags } = useTaskTags();

  const tasks = taskData?.data ?? [];
  const meta = taskData?.meta;

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('task-view-mode', mode);
  }, []);

  const handleScopeChange = useCallback((newScope: TaskScope, boardId?: number) => {
    setScope(newScope);
    setSelectedBoardId(boardId ?? null);
    setPage(1);
  }, []);

  const handleSort = useCallback((field: string) => {
    setSort((prev) => {
      const [currentField, currentDir] = prev.split(':');
      if (currentField === field) {
        return currentDir === 'asc' ? `${field}:desc` : `${field}:asc`;
      }
      return `${field}:asc`;
    });
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="タスク管理"
        actions={
          <Button onClick={() => setShowCreateModal(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            新規タスク
          </Button>
        }
      />

      {/* スコープ切替 + ビューモード切替 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* スコープ + ボードタブ */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* 標準スコープ */}
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {[
              { value: 'company' as const, label: '全社' },
              { value: 'business' as const, label: '事業別' },
              { value: 'personal' as const, label: 'マイタスク' },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => handleScopeChange(s.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  scope === s.value && !selectedBoardId
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* ボードタブ区切り */}
          {(boards ?? []).length > 0 && (
            <span className="text-muted-foreground/40">|</span>
          )}

          {/* ボードタブ */}
          {(boards ?? []).map((board) => (
            <div key={board.id} className="flex items-center gap-0.5">
              <button
                onClick={() => handleScopeChange('board', board.id)}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  scope === 'board' && selectedBoardId === board.id
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                {board.name}
              </button>
              {scope === 'board' && selectedBoardId === board.id && (
                <button
                  onClick={() => setShowBoardSettings(board.id)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="ボード設定"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {/* ボード作成ボタン */}
          <button
            onClick={() => setShowCreateBoard(true)}
            className="flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/30 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" />
            ボード
          </button>
        </div>

        {/* ビューモード */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => handleViewModeChange('list')}
            className={`rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            title="リスト"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleViewModeChange('kanban')}
            className={`rounded-md p-1.5 transition-colors ${viewMode === 'kanban' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            title="カンバン"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleViewModeChange('calendar')}
            className={`rounded-md p-1.5 transition-colors ${viewMode === 'calendar' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            title="カレンダー"
          >
            <Calendar className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* フィルターバー */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 検索 */}
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="タスク名・番号で検索..."
            className="w-full rounded-md border border-input bg-background py-1.5 pl-9 pr-3 text-sm"
          />
        </div>

        {/* ステータスフィルター */}
        <MultiSelectFilter
          label="ステータス"
          options={TASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
        />

        {/* 優先度フィルター */}
        <MultiSelectFilter
          label="優先度"
          options={TASK_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={priorityFilter}
          onChange={(v) => { setPriorityFilter(v); setPage(1); }}
        />

        {/* タグフィルター */}
        {tags && tags.length > 0 && (
          <MultiSelectFilter
            label="タグ"
            options={tags.map((t) => ({ value: String(t.id), label: t.name }))}
            selected={tagFilter.map(String)}
            onChange={(v) => { setTagFilter(v.map(Number)); setPage(1); }}
          />
        )}

        {/* 担当者フィルター（ユーザー名検索） */}
        <AssigneeFilter
          value={assigneeFilter}
          searchText={assigneeSearchText}
          onSearchChange={setAssigneeSearchText}
          onChange={(id) => { setAssigneeFilter(id); setPage(1); }}
        />

        {/* アーカイブ表示トグル */}
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
            className="accent-primary"
          />
          アーカイブを表示
        </label>

        {/* フィルタークリア */}
        {(statusFilter.length > 0 || priorityFilter.length > 0 || tagFilter.length > 0 || assigneeFilter || search) && (
          <button
            onClick={() => {
              setStatusFilter([]);
              setPriorityFilter([]);
              setAssigneeFilter(null);
              setAssigneeSearchText('');
              setTagFilter([]);
              setSearch('');
              setPage(1);
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="mr-1 inline h-3 w-3" />
            クリア
          </button>
        )}
      </div>

      {/* メインコンテンツ */}
      {viewMode === 'list' && (
        <TaskListView
          tasks={tasks}
          isLoading={isLoading}
          sort={sort}
          onSort={handleSort}
          onTaskClick={setSelectedTaskId}
          page={page}
          pageSize={pageSize}
          total={meta?.total ?? 0}
          totalPages={meta?.totalPages ?? 0}
          onPageChange={setPage}
        />
      )}

      {viewMode === 'kanban' && (
        <>
          <TaskKanbanView
            tasks={tasks}
            columns={columns}
            onTaskClick={setSelectedTaskId}
            onColumnChange={() => {
              // columnId変更はonReorderのペイロードに含まれるため不要
            }}
            onReorder={(items) => {
              const taskMap = new Map(tasks.map((t) => [t.id, t]));
              reorderTasks.mutate(
                items.map((it) => ({
                  id: it.id,
                  status: taskMap.get(it.id)?.status ?? 'todo',
                  sortOrder: it.sortOrder,
                  columnId: it.columnId,
                })),
              );
            }}
            onAddColumn={() => setShowColumnModal('create')}
            onEditColumn={(colId) => setShowColumnModal(colId)}
            onDeleteColumn={(colId) => {
              if (confirm('この列を削除しますか？列内のタスクは未分類になります。')) {
                deleteColumn.mutate(colId);
              }
            }}
            onReorderColumns={(items) => reorderColumns.mutate(items)}
          />
          {showColumnModal != null && (
            <ColumnEditModal
              mode={showColumnModal === 'create' ? 'create' : 'edit'}
              column={
                typeof showColumnModal === 'number'
                  ? columns.find((c) => c.id === showColumnModal)
                  : undefined
              }
              onClose={() => setShowColumnModal(null)}
              onSave={async (name, color) => {
                if (showColumnModal === 'create') {
                  await createColumn.mutateAsync({ name, color });
                } else if (typeof showColumnModal === 'number') {
                  await updateColumn.mutateAsync({ id: showColumnModal, name, color });
                }
                setShowColumnModal(null);
              }}
            />
          )}
        </>
      )}

      {viewMode === 'calendar' && (
        <TaskCalendarView
          tasks={tasks}
          onTaskClick={setSelectedTaskId}
        />
      )}

      {/* 詳細パネル */}
      {selectedTaskId != null && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {/* 作成モーダル */}
      {showCreateModal && (
        <TaskCreateModal
          defaultScope={scope}
          defaultBusinessId={scope === 'business' ? currentBusiness?.id : undefined}
          defaultBoardId={scope === 'board' ? selectedBoardId ?? undefined : undefined}
          onClose={() => setShowCreateModal(false)}
          onCreated={(task) => {
            setShowCreateModal(false);
            setSelectedTaskId(task.id);
          }}
        />
      )}

      {/* ボード設定パネル */}
      {showBoardSettings != null && (
        <TaskBoardSettingsPanel
          boardId={showBoardSettings}
          onClose={() => setShowBoardSettings(null)}
          onDeleted={() => {
            setShowBoardSettings(null);
            handleScopeChange('company');
          }}
        />
      )}

      {/* ボード作成モーダル */}
      {showCreateBoard && (
        <BoardCreateModal
          onClose={() => setShowCreateBoard(false)}
          onCreate={async (name) => {
            const board = await createBoard.mutateAsync({ name });
            setShowCreateBoard(false);
            handleScopeChange('board', (board as { id: number }).id);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// ボード作成モーダル
// ============================================

function BoardCreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">タスクボード作成</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">ボード名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="例: 営業チーム、役員ボード..."
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onCreate(name.trim()); }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
          <Button size="sm" onClick={() => name.trim() && onCreate(name.trim())} disabled={!name.trim()}>作成</Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// カラム編集モーダル
// ============================================

const COLUMN_COLORS = [
  '#6b7280', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
];

function ColumnEditModal({
  mode,
  column,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  column?: { id: number; name: string; color: string | null };
  onClose: () => void;
  onSave: (name: string, color: string | null) => void;
}) {
  const [name, setName] = useState(column?.name ?? '');
  const [color, setColor] = useState(column?.color ?? '#6b7280');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">
            {mode === 'create' ? '列を追加' : '列を編集'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">列名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="例: 未着手、進行中、完了..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) onSave(name.trim(), color);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">カラー</label>
            <div className="flex flex-wrap gap-2">
              {COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            size="sm"
            onClick={() => name.trim() && onSave(name.trim(), color)}
            disabled={!name.trim()}
          >
            {mode === 'create' ? '追加' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// リストビュー
// ============================================

interface TaskListViewProps {
  tasks: TaskListItem[];
  isLoading: boolean;
  sort: string;
  onSort: (field: string) => void;
  onTaskClick: (id: number) => void;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function TaskListView({
  tasks,
  isLoading,
  sort,
  onSort,
  onTaskClick,
  page,
  total,
  totalPages,
  onPageChange,
}: TaskListViewProps) {
  const { updateTask, reorderTasks } = useTaskMutations();
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleArchiveToggle = useCallback((taskId: number, isArchived: boolean) => {
    updateTask.mutate({ id: taskId, isArchived, version: 1 });
  }, [updateTask]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
    setExpandedTasks(new Set());
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const draggedId = Number(active.id);
    const overId = Number(over.id);
    const draggedTask = tasks.find((t) => t.id === draggedId);
    const overTask = tasks.find((t) => t.id === overId);

    if (!draggedTask || !overTask) return;

    // サブタスク化: タスクを親タスク（子を持つ or 自身が親でない）の上にドロップ
    // 条件: ドラッグ元が子タスクを持たない + ドロップ先が親タスク（parentTaskId=null）
    // → parentTaskIdを設定
    if (!draggedTask.parentTaskId && draggedTask.childrenCount === 0 && !overTask.parentTaskId && overTask.id !== draggedTask.id) {
      // overTaskの上にドラッグした = overTaskのサブタスクにする意図の可能性
      // ただし単純な並び替えと区別が難しいので、並び替えのみ実装
    }

    // 並び替え: sortOrderを更新
    const oldIndex = tasks.findIndex((t) => t.id === draggedId);
    const newIndex = tasks.findIndex((t) => t.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...tasks];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const items = reordered.map((t, i) => ({
      id: t.id,
      status: t.status,
      sortOrder: i,
    }));
    reorderTasks.mutate(items);
    // 並び替え後はsortOrderソートに切替（他のソートだと順番が保持されない）
    if (sort !== 'sortOrder:asc') {
      onSort('sortOrder');
    }
  }, [tasks, reorderTasks, sort, onSort]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;
  const [sortField, sortDir] = sort.split(':');
  // 3段階切替: 昇順 → 降順 → 手動順に戻る
  const handleSortClick = useCallback((field: string) => {
    if (sortField === field) {
      if (sortDir === 'asc') {
        // 昇順 → 降順
        onSort(field); // toggleで降順になる
      } else {
        // 降順 → 手動順に戻る
        onSort('sortOrder');
      }
    } else {
      // 別の列 → その列の昇順
      onSort(field);
    }
  }, [sortField, sortDir, onSort]);

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <div
      className="cursor-pointer px-3 py-2 hover:text-foreground"
      onClick={() => handleSortClick(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-foreground">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        タスクがありません
      </div>
    );
  }

  const GRID_COLS = 'grid-cols-[28px_28px_84px_minmax(180px,1fr)_76px_64px_72px_92px_minmax(80px,160px)_64px_84px]';

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="rounded-lg border">
          {/* ヘッダー（スクロール外に固定） */}
          <div className={`grid ${GRID_COLS} border-b bg-muted text-xs font-medium text-muted-foreground`}>
            <div
              className={`px-1 py-2 cursor-pointer hover:text-foreground ${sortField === 'sortOrder' ? 'text-foreground' : ''}`}
              onClick={() => { if (sortField !== 'sortOrder') onSort('sortOrder'); }}
              title="手動順に戻す"
            >
              <GripVertical className="h-3.5 w-3.5 mx-auto" />
            </div>
            <div className="px-2 py-2" />
            <SortHeader field="taskNo" label="No." />
            <SortHeader field="title" label="タスク名" />
            <SortHeader field="status" label="ステータス" />
            <SortHeader field="priority" label="優先度" />
            <SortHeader field="assigneeId" label="担当者" />
            <SortHeader field="dueDate" label="期限" />
            <div className="px-3 py-2">タグ</div>
            <div className="px-2 py-2 text-center">アーカイブ</div>
            <SortHeader field="updatedAt" label="更新日" />
          </div>
          {/* スクロール可能なボディ（ヘッダーとは分離） */}
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              <div>
                {tasks.map((task) => (
                  <TaskRowWithChildren
                    key={task.id}
                    task={task}
                    isExpanded={!activeId && expandedTasks.has(task.id)}
                    onToggleExpand={() => toggleExpand(task.id)}
                    onTaskClick={onTaskClick}
                    onArchiveToggle={handleArchiveToggle}
                    gridCols={GRID_COLS}
                  />
                ))}
              </div>
            </SortableContext>
          </div>
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="rounded-md border bg-background px-3 py-2 shadow-lg text-sm opacity-90">
              <span className="font-medium">{activeTask.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{activeTask.taskNo}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>{total}件中 {(page - 1) * 25 + 1}-{Math.min(page * 25, total)}件</span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-md border px-2 py-1 disabled:opacity-50"
            >
              前へ
            </button>
            <span className="px-2">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-md border px-2 py-1 disabled:opacity-50"
            >
              次へ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// タスク行（親 + 子タスクツリー表示）
// ============================================

function TaskRowWithChildren({
  task,
  isExpanded,
  onToggleExpand,
  onTaskClick,
  onArchiveToggle,
  gridCols,
}: {
  task: TaskListItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTaskClick: (id: number) => void;
  onArchiveToggle: (id: number, isArchived: boolean) => void;
  gridCols: string;
}) {
  const { data: detail } = useTaskDetail(isExpanded ? task.id : null);
  const children = detail?.children ?? [];

  return (
    <>
      <ParentTaskRow
        task={task}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        onClick={() => onTaskClick(task.id)}
        onArchiveToggle={onArchiveToggle}
        gridCols={gridCols}
      />
      {isExpanded && children.map((child, index) => (
        <ChildTaskRow
          key={child.id}
          task={child}
          isLast={index === children.length - 1}
          onClick={() => onTaskClick(child.id)}
          onArchiveToggle={onArchiveToggle}
          gridCols={gridCols}
        />
      ))}
    </>
  );
}

function ParentTaskRow({
  task,
  isExpanded,
  onToggleExpand,
  onClick,
  onArchiveToggle,
  gridCols,
}: {
  task: TaskListItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClick: () => void;
  onArchiveToggle: (id: number, isArchived: boolean) => void;
  gridCols: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  };

  const hasChildren = task.childrenCount > 0;
  const isOverdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate) < new Date();
  const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.value === task.status);
  const priorityOpt = TASK_PRIORITY_OPTIONS.find((o) => o.value === task.priority);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid ${gridCols} items-center border-b transition-colors hover:bg-muted/50 cursor-pointer text-sm ${isDragging ? 'bg-muted shadow-md' : ''}`}
      onClick={onClick}
    >
      <div className="px-1 py-2 cursor-grab" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-muted-foreground" />
      </div>
      <div className="px-2 py-2">
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className="rounded p-0.5 hover:bg-muted"
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{task.taskNo}</div>
      <div className="px-3 py-2 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{task.title}</span>
          {hasChildren && (
            <span className="text-xs text-muted-foreground shrink-0">({task.childrenDoneCount}/{task.childrenCount})</span>
          )}
          {task.checklistTotal > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">☑{task.checklistDoneCount}/{task.checklistTotal}</span>
          )}
        </div>
      </div>
      <div className="px-3 py-2">
        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: statusOpt?.color ?? '#94a3b8' }}>
          {statusOpt?.label ?? task.status}
        </span>
      </div>
      <div className="px-3 py-2">
        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: priorityOpt?.color ?? '#94a3b8' }}>
          {priorityOpt?.label ?? task.priority}
        </span>
      </div>
      <div className="px-3 py-2 truncate">{task.assigneeName ?? '-'}</div>
      <div className={`px-3 py-2 whitespace-nowrap ${isOverdue ? 'text-red-600 font-medium' : ''}`}>{task.dueDate ?? '-'}</div>
      <div className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span key={tag.id} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>
          ))}
        </div>
      </div>
      <div className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={task.isArchived}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onArchiveToggle(task.id, e.target.checked)}
          className="accent-primary cursor-pointer"
          title={task.isArchived ? 'アーカイブ解除' : 'アーカイブ'}
        />
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{task.updatedAt.split('T')[0]}</div>
    </div>
  );
}

function ChildTaskRow({
  task,
  isLast,
  onClick,
  onArchiveToggle,
  gridCols,
}: {
  task: TaskListItem;
  isLast: boolean;
  onClick: () => void;
  onArchiveToggle: (id: number, isArchived: boolean) => void;
  gridCols: string;
}) {
  const isOverdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate) < new Date();
  const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.value === task.status);

  return (
    <div
      className={`grid ${gridCols} items-center border-b transition-colors hover:bg-primary/[0.03] cursor-pointer text-sm`}
      style={{ backgroundColor: 'rgba(59,130,246,0.04)' }}
      onClick={onClick}
    >
      {/* ツリー記号 */}
      <div className="py-1.5 pl-6">
        <span className="text-blue-400/70 font-mono text-sm">{isLast ? '└' : '├'}</span>
      </div>
      <div className="py-1.5" />
      <div className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{task.taskNo}</div>
      <div className="px-3 py-1.5 min-w-0">
        <div className="flex items-center gap-2 pl-5">
          <div className="w-0.5 self-stretch bg-blue-400/30 rounded-full mr-1" style={{ minHeight: '16px' }} />
          <span className="truncate">{task.title}</span>
          {task.checklistTotal > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">☑{task.checklistDoneCount}/{task.checklistTotal}</span>
          )}
        </div>
      </div>
      <div className="px-3 py-1.5">
        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: statusOpt?.color ?? '#94a3b8' }}>
          {statusOpt?.label ?? task.status}
        </span>
      </div>
      <div className="px-3 py-1.5 text-xs text-muted-foreground">—</div>
      <div className="px-3 py-1.5 truncate">{task.assigneeName ?? '-'}</div>
      <div className={`px-3 py-1.5 whitespace-nowrap ${isOverdue ? 'text-red-600 font-medium' : ''}`}>{task.dueDate ?? '-'}</div>
      <div className="px-3 py-1.5" />
      <div className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={task.isArchived}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onArchiveToggle(task.id, e.target.checked)}
          className="accent-primary cursor-pointer"
          title={task.isArchived ? 'アーカイブ解除' : 'アーカイブ'}
        />
      </div>
      <div className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{task.updatedAt.split('T')[0]}</div>
    </div>
  );
}

// ============================================
// マルチセレクトフィルター
// ============================================

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
          selected.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-md border bg-popover p-1 shadow-md">
            {options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(
                      isSelected
                        ? selected.filter((v) => v !== opt.value)
                        : [...selected, opt.value]
                    );
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// 担当者フィルター（ユーザー名検索）
// ============================================

function AssigneeFilter({
  value,
  searchText,
  onSearchChange,
  onChange,
}: {
  value: number | null;
  searchText: string;
  onSearchChange: (text: string) => void;
  onChange: (id: number | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<{ id: number; userName: string }[]>([]);

  const handleSearch = async (q: string) => {
    onSearchChange(q);
    if (q.length < 1) { setUsers([]); return; }
    try {
      const res = await fetch(`/api/v1/users?search=${encodeURIComponent(q)}&pageSize=10`);
      const json = await res.json();
      setUsers((json.data ?? []).map((u: { id: number; userName: string }) => ({ id: u.id, userName: u.userName })));
    } catch {
      setUsers([]);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={searchText}
          onChange={(e) => { handleSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => searchText.length >= 1 && setIsOpen(true)}
          placeholder="担当者"
          className={`w-28 rounded-md border px-2 py-1.5 text-sm ${value ? 'border-primary bg-primary/5 text-primary' : 'border-input bg-background'}`}
        />
        {value && (
          <button onClick={() => { onChange(null); onSearchChange(''); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {isOpen && users.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] max-h-[200px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  onChange(u.id);
                  onSearchChange(u.userName);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                  {u.userName.charAt(0)}
                </div>
                {u.userName}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
