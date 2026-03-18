import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { updateTaskSchema, formatTaskDetail } from '@/lib/task-helpers';
import { createNotificationsForUsers } from '@/lib/notification-helper';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// ============================================
// タスク詳細インクルード定義
// ============================================

const taskDetailInclude = {
  assignees: { select: { id: true, userId: true, userName: true }, orderBy: { assignedAt: 'asc' as const } },
  createdBy: { select: { userName: true } },
  business: { select: { businessName: true } },
  column: { select: { id: true, name: true, color: true } },
  tags: {
    include: {
      tag: { select: { id: true, name: true, color: true } },
    },
  },
  _count: { select: { children: true, attachments: true } },
  attachments: {
    include: { uploadedBy: { select: { userName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  children: {
    include: {
      assignees: { select: { id: true, userId: true, userName: true }, orderBy: { assignedAt: 'asc' as const } },
      createdBy: { select: { userName: true } },
      business: { select: { businessName: true } },
      column: { select: { id: true, name: true, color: true } },
      tags: {
        include: {
          tag: { select: { id: true, name: true, color: true } },
        },
      },
      _count: { select: { children: true } },
      children: { select: { id: true, status: true } },
    },
  },
  notifyTargets: {
    include: {
      user: { select: { userName: true } },
    },
  },
} as const;

// ============================================
// GET /api/v1/tasks/:id
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) throw ApiError.notFound('タスクが見つかりません');

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: taskDetailInclude,
    });

    if (!task) throw ApiError.notFound('タスクが見つかりません');

    return NextResponse.json({ success: true, data: formatTaskDetail(task) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/tasks/:id
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) throw ApiError.notFound('タスクが見つかりません');

    const body = await request.json();
    const data = updateTaskSchema.parse(body);

    // 楽観的ロック確認
    const current = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        version: true,
        status: true,
        notifyLevel: true,
        notifyTargets: { select: { userId: true } },
      },
    });
    if (!current) throw ApiError.notFound('タスクが見つかりません');
    if (current.version !== data.version) {
      throw ApiError.conflict('データが更新されています。画面を更新してください。');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tagIds, notifyTargetUserIds, assigneeUserIds, assigneeNames, version: _version, checklist, dueDate, status, columnId, ...rest } = data;

    // ステータス変更に伴う completedAt の更新
    let completedAt: Date | null | undefined = undefined;
    if (status !== undefined) {
      if (status === 'done' && current.status !== 'done') {
        completedAt = new Date();
      } else if (status !== 'done' && current.status === 'done') {
        completedAt = null;
      }
    }

    // checklist の型キャスト
    const checklistValue =
      checklist !== undefined ? (checklist as Prisma.InputJsonValue) : undefined;

    // dueDate の処理
    let dueDateValue: Date | null | undefined = undefined;
    if (dueDate !== undefined) {
      dueDateValue = dueDate ? new Date(dueDate) : null;
    }

    // トランザクションで更新
    const updated = await prisma.$transaction(async (tx) => {
      // タグの更新
      if (tagIds !== undefined) {
        await tx.taskTagOnTask.deleteMany({ where: { taskId } });
        if (tagIds.length > 0) {
          await tx.taskTagOnTask.createMany({
            data: tagIds.map((tagId) => ({ taskId, tagId })),
          });
        }
      }

      // 通知対象の更新
      if (notifyTargetUserIds !== undefined) {
        await tx.taskNotifyTarget.deleteMany({ where: { taskId } });
        if (notifyTargetUserIds.length > 0) {
          await tx.taskNotifyTarget.createMany({
            data: notifyTargetUserIds.map((userId) => ({ taskId, userId })),
          });
        }
      }

      // 担当者の更新
      if (assigneeUserIds !== undefined || assigneeNames !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId } });
        const assigneeRecords: { taskId: number; userId?: number; userName: string }[] = [];
        if (assigneeUserIds && assigneeUserIds.length > 0) {
          const users = await tx.user.findMany({
            where: { id: { in: assigneeUserIds } },
            select: { id: true, userName: true },
          });
          for (const u of users) {
            assigneeRecords.push({ taskId, userId: u.id, userName: u.userName });
          }
        }
        if (assigneeNames && assigneeNames.length > 0) {
          for (const name of assigneeNames) {
            assigneeRecords.push({ taskId, userName: name });
          }
        }
        if (assigneeRecords.length > 0) {
          await tx.taskAssignee.createMany({ data: assigneeRecords });
        }
      }

      // タスク本体の更新
      return tx.task.update({
        where: { id: taskId },
        data: {
          ...rest,
          ...(status !== undefined ? { status } : {}),
          ...(columnId !== undefined ? { columnId: columnId ?? null } : {}),
          ...(checklistValue !== undefined ? { checklist: checklistValue } : {}),
          ...(dueDateValue !== undefined ? { dueDate: dueDateValue } : {}),
          ...(completedAt !== undefined ? { completedAt } : {}),
          version: { increment: 1 },
        },
        include: taskDetailInclude,
      });
    });

    // タスク完了通知（notifyLevel が none でない場合、通知対象者に送信）
    if (
      status === 'done' &&
      current.status !== 'done' &&
      updated.notifyLevel !== 'none'
    ) {
      const notifyUserIds = (updated.notifyTargets as { userId: number }[])
        .map((nt) => nt.userId)
        .filter((uid) => uid !== user.id);

      if (notifyUserIds.length > 0) {
        await createNotificationsForUsers(notifyUserIds, {
          type: 'task_completed',
          title: 'タスクが完了しました',
          message: `「${updated.title}」が完了しました`,
          relatedEntity: 'task',
          relatedEntityId: updated.id,
        });
      }
    }

    return NextResponse.json({ success: true, data: formatTaskDetail(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/tasks/:id
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) throw ApiError.notFound('タスクが見つかりません');

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, createdById: true },
    });
    if (!task) throw ApiError.notFound('タスクが見つかりません');

    // 作成者または admin のみ削除可能
    if (user.role !== 'admin' && task.createdById !== user.id) {
      throw ApiError.forbidden('タスクの作成者または管理者のみ削除できます');
    }

    await prisma.task.delete({ where: { id: taskId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
