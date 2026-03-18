import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy, TASK_SORT_FIELDS } from '@/lib/sort-helper';
import { whereIn, whereDateRange } from '@/lib/filter-helper';
import {
  generateTaskNo,
  createTaskSchema,
  buildTaskVisibilityWhere,
  formatTaskListItem,
} from '@/lib/task-helpers';
import { createNotification } from '@/lib/notification-helper';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// ============================================
// タスク一覧インクルード定義
// ============================================

const taskListInclude = {
  assignee: { select: { userName: true } },
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

// ============================================
// GET /api/v1/tasks
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)));
    const search = searchParams.get('search') ?? '';
    const sortItems = parseSortParams(searchParams, 'createdAt', 'desc');

    // 個別フィルターパラメータ
    const businessIdParam = searchParams.get('businessId');
    const assigneeIdParam = searchParams.get('assigneeId');
    const relatedEntityType = searchParams.get('relatedEntityType');
    const relatedEntityIdParam = searchParams.get('relatedEntityId');
    const parentOnly = searchParams.get('parentOnly') === 'true';

    // タグIDフィルター（カンマ区切り）
    const tagIdsParam = searchParams.get('tagIds');
    const tagIds = tagIdsParam
      ? tagIdsParam.split(',').map((v) => parseInt(v.trim(), 10)).filter((n) => !isNaN(n))
      : [];

    // スコープ可視範囲
    const visibilityWhere = buildTaskVisibilityWhere(user);

    const where: Prisma.TaskWhereInput = {
      ...visibilityWhere,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { taskNo: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(whereIn(searchParams, 'status') ?? {}),
      ...(whereIn(searchParams, 'priority') ?? {}),
      ...(whereIn(searchParams, 'scope') ?? {}),
      ...(whereDateRange(searchParams, 'dueDate') ?? {}),
      ...(businessIdParam ? { businessId: parseInt(businessIdParam, 10) } : {}),
      ...(searchParams.get('boardId') ? { boardId: parseInt(searchParams.get('boardId')!, 10) } : {}),
      ...(searchParams.get('showArchived') !== 'true' ? { isArchived: false } : {}),
      ...(assigneeIdParam ? { assigneeId: parseInt(assigneeIdParam, 10) } : {}),
      ...(relatedEntityType ? { relatedEntityType } : {}),
      ...(relatedEntityIdParam ? { relatedEntityId: parseInt(relatedEntityIdParam, 10) } : {}),
      ...(parentOnly ? { parentTaskId: null } : {}),
      ...(tagIds.length > 0
        ? { tags: { some: { tagId: { in: tagIds } } } }
        : {}),
    };

    const orderBy = buildOrderBy(sortItems, TASK_SORT_FIELDS, [{ field: 'createdAt', direction: 'desc' }]);

    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: taskListInclude,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: tasks.map(formatTaskListItem),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/tasks
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const data = createTaskSchema.parse(body);

    const {
      title,
      assigneeId,
      parentTaskId,
      scope,
      businessId,
      columnId,
      checklist,
      notifyTargetUserIds,
      tagIds,
      notifyLevel,
      ...rest
    } = data;

    // scope が 'business' の場合は businessId が必須
    if (scope === 'business' && !businessId) {
      throw ApiError.badRequest('事業スコープの場合は事業IDが必要です');
    }

    // 親タスク存在確認 + 2階層制限（親タスクが子タスクでないこと）
    if (parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: parentTaskId },
        select: { id: true, parentTaskId: true },
      });
      if (!parentTask) {
        throw ApiError.notFound('親タスクが見つかりません');
      }
      if (parentTask.parentTaskId !== null) {
        throw ApiError.badRequest('2階層より深いタスクは作成できません');
      }
    }

    // アサイン先をnotifyTargets に自動追加（作成者以外の場合）
    const resolvedNotifyTargetUserIds = [...notifyTargetUserIds];
    if (
      assigneeId &&
      assigneeId !== user.id &&
      !resolvedNotifyTargetUserIds.includes(assigneeId)
    ) {
      resolvedNotifyTargetUserIds.push(assigneeId);
    }

    const taskNo = await generateTaskNo();

    const created = await prisma.task.create({
      data: {
        taskNo,
        title,
        assigneeId: assigneeId ?? null,
        createdById: user.id,
        scope,
        businessId: businessId ?? null,
        columnId: columnId ?? null,
        parentTaskId: parentTaskId ?? null,
        checklist: checklist as Prisma.InputJsonValue,
        notifyLevel,
        ...rest,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : null,
        notifyTargets: {
          create: resolvedNotifyTargetUserIds.map((userId) => ({ userId })),
        },
        tags: {
          create: tagIds.map((tagId) => ({ tagId })),
        },
      },
      include: taskListInclude,
    });

    // アサイン通知（アサイン先が自分以外の場合）
    if (notifyLevel !== 'none' && assigneeId && assigneeId !== user.id) {
      await createNotification({
        userId: assigneeId,
        type: 'task_assigned',
        title: 'タスクが割り当てられました',
        message: `「${title}」が割り当てられました`,
        relatedEntity: 'task',
        relatedEntityId: created.id,
      });
    }

    return NextResponse.json({ success: true, data: formatTaskListItem(created) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
