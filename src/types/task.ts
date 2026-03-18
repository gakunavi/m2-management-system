// ============================================
// タスク管理 型定義
// ============================================

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'on_hold';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskScope = 'company' | 'business' | 'personal' | 'board';
export type TaskNotifyLevel = 'none' | 'in_app' | 'in_app_and_email';
export type TaskTagScope = 'shared' | 'personal';

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TaskTagItem {
  id: number;
  name: string;
  color: string;
  scope: TaskTagScope;
  ownerId: number;
  ownerName?: string;
}

export interface TaskNotifyTargetItem {
  userId: number;
  userName: string;
}

/** 一覧表示用 */
export interface TaskListItem {
  id: number;
  taskNo: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  createdById: number;
  creatorName: string;
  scope: TaskScope;
  businessId: number | null;
  businessName: string | null;
  parentTaskId: number | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  notifyLevel: TaskNotifyLevel;
  tags: { id: number; name: string; color: string }[];
  childrenCount: number;
  childrenDoneCount: number;
  checklistTotal: number;
  checklistDoneCount: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 詳細表示用（子タスク・チェックリスト含む） */
export interface TaskDetail extends TaskListItem {
  description: string | null;
  memo: string | null;
  checklist: ChecklistItem[];
  sortOrder: number;
  version: number;
  children: TaskListItem[];
  notifyTargets: TaskNotifyTargetItem[];
}

// ============================================
// ステータス・優先度のラベル定義
// ============================================

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'todo', label: '未着手', color: '#94a3b8' },
  { value: 'in_progress', label: '進行中', color: '#3b82f6' },
  { value: 'on_hold', label: '保留', color: '#f59e0b' },
  { value: 'done', label: '完了', color: '#22c55e' },
];

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'urgent', label: '緊急', color: '#ef4444' },
  { value: 'high', label: '高', color: '#f97316' },
  { value: 'medium', label: '中', color: '#eab308' },
  { value: 'low', label: '低', color: '#94a3b8' },
];

export const TASK_SCOPE_OPTIONS: { value: TaskScope; label: string }[] = [
  { value: 'company', label: '全社' },
  { value: 'business', label: '事業別' },
  { value: 'personal', label: '個人' },
  { value: 'board', label: 'ボード' },
];

export const TASK_NOTIFY_LEVEL_OPTIONS: { value: TaskNotifyLevel; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'in_app', label: 'アプリ内' },
  { value: 'in_app_and_email', label: 'アプリ+メール' },
];

export const TASK_RELATED_ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'project', label: '案件' },
  { value: 'customer', label: '顧客' },
  { value: 'partner', label: '代理店' },
];
