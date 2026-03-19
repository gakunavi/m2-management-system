import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { TaskPriority } from '@/types/task';

// ============================================
// タスク番号採番
// ============================================

export async function generateTaskNo(): Promise<string> {
  const latest = await prisma.task.findFirst({
    where: { taskNo: { startsWith: 'TASK-' } },
    orderBy: { taskNo: 'desc' },
    select: { taskNo: true },
  });
  if (!latest) return 'TASK-0001';
  const num = parseInt(latest.taskNo.replace('TASK-', ''), 10);
  return `TASK-${String(num + 1).padStart(4, '0')}`;
}

// ============================================
// 優先度ソート順
// ============================================

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ============================================
// バリデーションスキーマ
// ============================================

const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  checked: z.boolean(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1, 'タスク名は必須です').max(200),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'done', 'on_hold']).default('todo'),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
  dueDate: z.string().optional().nullable(),
  assigneeUserIds: z.array(z.number().int().positive()).optional().default([]),
  assigneeNames: z.array(z.string().min(1).max(100)).optional().default([]),
  scope: z.enum(['company', 'business', 'personal', 'board']).default('company'),
  businessId: z.number().int().positive().optional().nullable(),
  boardId: z.number().int().positive().optional().nullable(),
  parentTaskId: z.number().int().positive().optional().nullable(),
  checklist: z.array(checklistItemSchema).default([]),
  relatedEntityType: z.enum(['project', 'customer', 'partner']).optional().nullable(),
  relatedEntityId: z.number().int().positive().optional().nullable(),
  notifyLevel: z.enum(['none', 'in_app', 'in_app_and_email']).default('in_app'),
  memo: z.string().max(5000).optional().nullable(),
  taskUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  columnId: z.number().int().positive().optional().nullable(),
  notifyTargetUserIds: z.array(z.number().int().positive()).default([]),
  tagIds: z.array(z.number().int().positive()).default([]),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  memo: z.string().max(5000).optional().nullable(),
  taskUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  isArchived: z.boolean().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'on_hold']).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  dueDate: z.string().optional().nullable(),
  assigneeUserIds: z.array(z.number().int().positive()).optional(),
  assigneeNames: z.array(z.string().min(1).max(100)).optional(),
  scope: z.enum(['company', 'business', 'personal', 'board']).optional(),
  businessId: z.number().int().positive().optional().nullable(),
  boardId: z.number().int().positive().optional().nullable(),
  checklist: z.array(checklistItemSchema).optional(),
  columnId: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().optional(),
  relatedEntityType: z.enum(['project', 'customer', 'partner']).optional().nullable(),
  relatedEntityId: z.number().int().positive().optional().nullable(),
  notifyLevel: z.enum(['none', 'in_app', 'in_app_and_email']).optional(),
  notifyTargetUserIds: z.array(z.number().int().positive()).optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
  version: z.number().int().min(1),
});

// ============================================
// スコープ別アクセス制御
// ============================================

interface SessionUser {
  id: number;
  role: string;
}

/**
 * ユーザーのロールとIDに基づいてタスクの可視範囲のwhere句を構築する
 * - admin: 全タスクが見える
 * - staff: マイタスク(boardId=null, 自分作成) + メンバーのボード
 */
export function buildTaskVisibilityWhere(user: SessionUser) {
  if (user.role === 'admin') {
    return {}; // admin は全て見える
  }

  // スコープ廃止後: マイタスク(boardId=null, 自分作成) or ボードメンバー のタスクのみ
  return {
    OR: [
      { boardId: null, createdById: user.id }, // マイタスク
      { board: { members: { some: { userId: user.id } } } }, // メンバーのボード
    ],
  };
}

// ============================================
// フォーマットヘルパー
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatTaskListItem(task: any) {
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  return {
    id: task.id,
    taskNo: task.taskNo,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null,
    assignees: (task.assignees ?? []).map((a: { id: number; userId: number | null; userName: string }) => ({
      id: a.id,
      userId: a.userId,
      userName: a.userName,
    })),
    createdById: task.createdById,
    creatorName: task.createdBy?.userName ?? '',
    scope: task.scope,
    businessId: task.businessId,
    businessName: task.business?.businessName ?? null,
    columnId: task.columnId ?? null,
    columnName: task.column?.name ?? null,
    sortOrder: task.sortOrder ?? 0,
    version: task.version ?? 1,
    parentTaskId: task.parentTaskId,
    relatedEntityType: task.relatedEntityType,
    relatedEntityId: task.relatedEntityId,
    notifyLevel: task.notifyLevel,
    taskUrl: task.taskUrl ?? null,
    isArchived: task.isArchived ?? false,
    tags: (task.tags ?? []).map((tt: { tag: { id: number; name: string; color: string } }) => ({
      id: tt.tag.id,
      name: tt.tag.name,
      color: tt.tag.color,
    })),
    childrenCount: task._count?.children ?? 0,
    attachmentCount: task._count?.attachments ?? 0,
    childrenDoneCount: (task.children ?? []).filter((c: { status: string }) => c.status === 'done').length,
    checklistTotal: checklist.length,
    checklistDoneCount: checklist.filter((c: { checked: boolean }) => c.checked).length,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatTaskDetail(task: any) {
  const base = formatTaskListItem(task);
  return {
    ...base,
    description: task.description,
    memo: task.memo ?? null,
    checklist: Array.isArray(task.checklist) ? task.checklist : [],
    version: task.version,
    children: (task.children ?? []).map(formatTaskListItem),
    notifyTargets: (task.notifyTargets ?? []).map((nt: { userId: number; user: { userName: string } }) => ({
      userId: nt.userId,
      userName: nt.user?.userName ?? '',
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attachments: (task.attachments ?? []).map((a: any) => ({
      id: a.id,
      fileName: a.fileName,
      fileKey: a.fileKey,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      uploadedById: a.uploadedById,
      uploaderName: a.uploadedBy?.userName ?? '',
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
