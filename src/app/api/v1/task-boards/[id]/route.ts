import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// ボード詳細インクルード定義
// ============================================

const boardDetailInclude = {
  members: {
    include: {
      user: { select: { id: true, userName: true } },
    },
  },
  _count: { select: { tasks: true } },
  createdBy: { select: { userName: true } },
} as const;

// ============================================
// Zodスキーマ
// ============================================

const updateBoardSchema = z.object({
  name: z.string().min(1, 'ボード名は必須です').max(100, 'ボード名は100文字以内で入力してください').optional(),
  description: z.string().max(1000, '説明は1000文字以内で入力してください').nullable().optional(),
});

// ============================================
// レスポンスフォーマット
// ============================================

function formatBoard(board: {
  id: number;
  name: string;
  description: string | null;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { userName: string };
  members: {
    userId: number;
    role: string;
    joinedAt: Date;
    user: { id: number; userName: string };
  }[];
  _count: { tasks: number };
}) {
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    createdById: board.createdById,
    creatorName: board.createdBy.userName,
    memberCount: board.members.length,
    taskCount: board._count.tasks,
    members: board.members.map((m) => ({
      userId: m.userId,
      userName: m.user.userName,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

// ============================================
// GET /api/v1/task-boards/:id
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
    const boardId = parseInt(id, 10);
    if (isNaN(boardId)) throw ApiError.notFound('ボードが見つかりません');

    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      include: boardDetailInclude,
    });

    if (!board) throw ApiError.notFound('ボードが見つかりません');

    // admin またはメンバーのみアクセス可能
    const isMember = board.members.some((m) => m.userId === user.id);
    if (user.role !== 'admin' && !isMember) {
      throw ApiError.forbidden('このボードにアクセスする権限がありません');
    }

    return NextResponse.json({ success: true, data: formatBoard(board) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/task-boards/:id
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
    const boardId = parseInt(id, 10);
    if (isNaN(boardId)) throw ApiError.notFound('ボードが見つかりません');

    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      select: { id: true, createdById: true },
    });

    if (!board) throw ApiError.notFound('ボードが見つかりません');

    // 作成者または admin のみ更新可能
    if (user.role !== 'admin' && board.createdById !== user.id) {
      throw ApiError.forbidden('ボードの作成者または管理者のみ更新できます');
    }

    const body = await request.json();
    const data = updateBoardSchema.parse(body);

    const updated = await prisma.taskBoard.update({
      where: { id: boardId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
      include: boardDetailInclude,
    });

    return NextResponse.json({ success: true, data: formatBoard(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/task-boards/:id
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
    const boardId = parseInt(id, 10);
    if (isNaN(boardId)) throw ApiError.notFound('ボードが見つかりません');

    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      select: { id: true, createdById: true },
    });

    if (!board) throw ApiError.notFound('ボードが見つかりません');

    // 作成者または admin のみ削除可能
    if (user.role !== 'admin' && board.createdById !== user.id) {
      throw ApiError.forbidden('ボードの作成者または管理者のみ削除できます');
    }

    // ボードに紐づくタスクのboardIdをnullに設定してからボードを削除
    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { boardId },
        data: { boardId: null },
      });
      await tx.taskBoard.delete({ where: { id: boardId } });
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
