'use client';

import { useState, useCallback, useMemo } from 'react';
import { Plus, List, LayoutGrid, Calendar, Search, ChevronDown, ChevronRight, X, Users, Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useBusiness } from '@/hooks/use-business';
import { useTaskList, useTaskTags, useTaskDetail, useTaskBoards, useTaskBoardMutations } from '@/hooks/use-tasks';
import { useDebounce } from '@/hooks/use-debounce';
import { TaskDetailPanel } from '@/components/features/task/task-detail-panel';
import { TaskCreateModal } from '@/components/features/task/task-create-modal';
import { TaskBoardSettingsPanel } from '@/components/features/task/task-board-settings-panel';
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '@/types/task';
import type { TaskListItem, TaskScope } from '@/types/task';

type ViewMode = 'list' | 'kanban' | 'calendar';

export function TasksClient() {
  const { currentBusiness } = useBusiness();

  // ビューモード
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('task-view-mode') as ViewMode) || 'list';
    }
    return 'list';
  });

  // スコープ
  const [scope, setScope] = useState<TaskScope>('company');
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [showBoardSettings, setShowBoardSettings] = useState<number | null>(null);
  const [showCreateBoard, setShowCreateBoard] = useState(false);

  // ボード
  const { data: boards } = useTaskBoards();
  const { createBoard } = useTaskBoardMutations();

  // フィルター
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<number[]>([]);

  // ページネーション & ソート
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sort, setSort] = useState('dueDate:asc');

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
    tagIds: tagFilter.length > 0 ? tagFilter.join(',') : undefined,
    parentOnly: viewMode !== 'list' ? true : undefined,
  }), [page, pageSize, debouncedSearch, sort, scope, currentBusiness?.id, selectedBoardId, statusFilter, priorityFilter, tagFilter, viewMode]);

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

        {/* フィルタークリア */}
        {(statusFilter.length > 0 || priorityFilter.length > 0 || tagFilter.length > 0 || search) && (
          <button
            onClick={() => {
              setStatusFilter([]);
              setPriorityFilter([]);
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
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-12 text-center text-muted-foreground">
          カンバンビューは Phase 2 で実装予定です
        </div>
      )}

      {viewMode === 'calendar' && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-12 text-center text-muted-foreground">
          カレンダービューは Phase 2 で実装予定です
        </div>
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
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  const toggleExpand = useCallback((id: number) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const [sortField, sortDir] = sort.split(':');

  const SortHeader = ({ field, label, width }: { field: string; label: string; width?: string }) => (
    <th
      className={`sticky top-0 z-20 cursor-pointer bg-muted/80 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground ${width ? `w-[${width}]` : ''}`}
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-foreground">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
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

  return (
    <div>
      <div className="overflow-auto rounded-lg border" style={{ maxHeight: 'calc(100vh - 340px)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="sticky top-0 z-20 w-8 bg-muted/80 px-2 py-2" />
              <SortHeader field="taskNo" label="No." />
              <SortHeader field="title" label="タスク名" />
              <SortHeader field="status" label="ステータス" />
              <SortHeader field="priority" label="優先度" />
              <SortHeader field="assigneeId" label="担当者" />
              <SortHeader field="dueDate" label="期限" />
              <th className="sticky top-0 z-20 bg-muted/80 px-3 py-2 text-left text-xs font-medium text-muted-foreground">タグ</th>
              <SortHeader field="updatedAt" label="更新日" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <TaskRowWithChildren
                key={task.id}
                task={task}
                isExpanded={expandedTasks.has(task.id)}
                onToggleExpand={() => toggleExpand(task.id)}
                onTaskClick={onTaskClick}
              />
            ))}
          </tbody>
        </table>
      </div>

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
}: {
  task: TaskListItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTaskClick: (id: number) => void;
}) {
  // 展開時に親タスクの詳細（子タスク含む）を取得
  const { data: detail } = useTaskDetail(isExpanded ? task.id : null);
  const children = detail?.children ?? [];

  return (
    <>
      {/* 親タスク行 */}
      <ParentTaskRow
        task={task}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        onClick={() => onTaskClick(task.id)}
      />

      {/* 子タスク行（展開時） */}
      {isExpanded && children.map((child, index) => (
        <ChildTaskRow
          key={child.id}
          task={child}
          isLast={index === children.length - 1}
          onClick={() => onTaskClick(child.id)}
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
}: {
  task: TaskListItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClick: () => void;
}) {
  const hasChildren = task.childrenCount > 0;
  const isOverdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate) < new Date();
  const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.value === task.status);
  const priorityOpt = TASK_PRIORITY_OPTIONS.find((o) => o.value === task.priority);

  return (
    <tr
      className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
      onClick={onClick}
    >
      <td className="px-2 py-2">
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
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{task.taskNo}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{task.title}</span>
          {hasChildren && (
            <span className="text-xs text-muted-foreground">({task.childrenDoneCount}/{task.childrenCount})</span>
          )}
          {task.checklistTotal > 0 && (
            <span className="text-xs text-muted-foreground">☑{task.checklistDoneCount}/{task.checklistTotal}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: statusOpt?.color ?? '#94a3b8' }}>
          {statusOpt?.label ?? task.status}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: priorityOpt?.color ?? '#94a3b8' }}>
          {priorityOpt?.label ?? task.priority}
        </span>
      </td>
      <td className="px-3 py-2 text-sm">{task.assigneeName ?? '-'}</td>
      <td className={`px-3 py-2 text-sm whitespace-nowrap ${isOverdue ? 'text-red-600 font-medium' : ''}`}>{task.dueDate ?? '-'}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span key={tag.id} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{task.updatedAt.split('T')[0]}</td>
    </tr>
  );
}

function ChildTaskRow({
  task,
  isLast,
  onClick,
}: {
  task: TaskListItem;
  isLast: boolean;
  onClick: () => void;
}) {
  const isOverdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate) < new Date();
  const statusOpt = TASK_STATUS_OPTIONS.find((o) => o.value === task.status);

  return (
    <tr
      className="border-b transition-colors hover:bg-primary/[0.03] cursor-pointer"
      style={{ backgroundColor: 'var(--child-task-bg, rgba(59,130,246,0.04))' }}
      onClick={onClick}
    >
      {/* ツリー記号（大きめインデント） */}
      <td className="py-1.5" style={{ paddingLeft: '24px' }}>
        <span className="text-blue-400/70 font-mono text-sm">{isLast ? '└' : '├'}</span>
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap" style={{ paddingLeft: '8px' }}>
        {task.taskNo}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2" style={{ paddingLeft: '20px' }}>
          <div className="w-0.5 self-stretch bg-blue-400/30 rounded-full mr-1" style={{ minHeight: '16px' }} />
          <span className="text-sm">{task.title}</span>
          {task.checklistTotal > 0 && (
            <span className="text-xs text-muted-foreground">☑{task.checklistDoneCount}/{task.checklistTotal}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5">
        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: statusOpt?.color ?? '#94a3b8' }}>
          {statusOpt?.label ?? task.status}
        </span>
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground">—</td>
      <td className="px-3 py-1.5 text-sm">{task.assigneeName ?? '-'}</td>
      <td className={`px-3 py-1.5 text-sm whitespace-nowrap ${isOverdue ? 'text-red-600 font-medium' : ''}`}>{task.dueDate ?? '-'}</td>
      <td className="px-3 py-1.5" />
      <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{task.updatedAt.split('T')[0]}</td>
    </tr>
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
