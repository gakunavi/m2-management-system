import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// ボード一覧インクルード定義
// ============================================

const boardListInclude = {
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

const createBoardSchema = z.object({
  name: z.string().min(1, 'ボード名は必須です').max(100, 'ボード名は100文字以内で入力してください'),
  description: z.string().max(1000, '説明は1000文字以内で入力してください').optional(),
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
// GET /api/v1/task-boards
// ============================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    // ユーザーのメンバーシップ（tabOrder付き）を取得してボードをソート
    const memberships = await prisma.taskBoardMember.findMany({
      where: { userId: user.id },
      select: { boardId: true, tabOrder: true },
      orderBy: { tabOrder: 'asc' },
    });

    const boards = await prisma.taskBoard.findMany({
      where: {
        id: { in: memberships.map((m) => m.boardId) },
      },
      include: boardListInclude,
    });

    // tabOrder順にソート
    const orderMap = new Map(memberships.map((m) => [m.boardId, m.tabOrder]));
    const sortedBoards = [...boards].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));

    return NextResponse.json({
      success: true,
      data: sortedBoards.map((b) => ({ ...formatBoard(b), tabOrder: orderMap.get(b.id) ?? 0 })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/task-boards
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const data = createBoardSchema.parse(body);

    const created = await prisma.taskBoard.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        createdById: user.id,
        members: {
          create: {
            userId: user.id,
            role: 'owner',
          },
        },
      },
      include: boardListInclude,
    });

    return NextResponse.json({ success: true, data: formatBoard(created) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
