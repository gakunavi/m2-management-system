import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { generateTaskNo, formatTaskListItem } from '@/lib/task-helpers';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// ============================================
// POST /api/v1/tasks/:id/copy
// タスクをコピー（複製）
// ============================================

const taskListInclude = {
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
  children: { select: { id: true, status: true } },
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const sourceId = parseInt(id, 10);
    if (isNaN(sourceId)) throw ApiError.notFound('タスクが見つかりません');

    // コピー先ボードID（オプション）
    const body = await request.json().catch(() => ({}));
    const targetBoardId: number | null = body.boardId !== undefined ? body.boardId : undefined;

    // コピー元タスクを取得
    const source = await prisma.task.findUnique({
      where: { id: sourceId },
      include: {
        assignees: { select: { userId: true, userName: true } },
        tags: { select: { tagId: true } },
        notifyTargets: { select: { userId: true } },
      },
    });
    if (!source) throw ApiError.notFound('タスクが見つかりません');

    const taskNo = await generateTaskNo();
    const boardId = targetBoardId !== undefined ? targetBoardId : source.boardId;

    // ボード変更時はcolumnIdをリセット
    const columnId = (targetBoardId !== undefined && targetBoardId !== source.boardId)
      ? null
      : source.columnId;

    const created = await prisma.task.create({
      data: {
        taskNo,
        title: `${source.title}（コピー）`,
        description: source.description,
        memo: source.memo,
        status: 'todo',
        priority: source.priority,
        dueDate: source.dueDate,
        scope: source.scope,
        businessId: source.businessId,
        boardId,
        columnId,
        createdById: user.id,
        checklist: source.checklist as Prisma.InputJsonValue ?? [],
        relatedEntityType: source.relatedEntityType,
        relatedEntityId: source.relatedEntityId,
        notifyLevel: source.notifyLevel,
        taskUrl: source.taskUrl,
        // サブタスクはコピーしない（parentTaskId = null）
        parentTaskId: null,
        assignees: {
          create: source.assignees.map((a) => ({
            userId: a.userId,
            userName: a.userName,
          })),
        },
        tags: {
          create: source.tags.map((t) => ({ tagId: t.tagId })),
        },
        notifyTargets: {
          create: source.notifyTargets.map((nt) => ({ userId: nt.userId })),
        },
      },
      include: taskListInclude,
    });

    return NextResponse.json(
      { success: true, data: formatTaskListItem(created) },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
