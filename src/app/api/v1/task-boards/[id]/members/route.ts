import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// Zodスキーマ
// ============================================

const addMemberSchema = z.object({
  userId: z.number({ required_error: 'ユーザーIDは必須です' }).int().positive(),
});

// ============================================
// POST /api/v1/task-boards/:id/members
// ============================================

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
    const boardId = parseInt(id, 10);
    if (isNaN(boardId)) throw ApiError.notFound('ボードが見つかりません');

    // ボード存在確認
    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      include: {
        members: { select: { userId: true } },
      },
    });

    if (!board) throw ApiError.notFound('ボードが見つかりません');

    // リクエストユーザーがボードのメンバーであることを確認
    const isCurrentUserMember = board.members.some((m) => m.userId === user.id);
    if (user.role !== 'admin' && !isCurrentUserMember) {
      throw ApiError.forbidden('このボードのメンバーのみ招待できます');
    }

    const body = await request.json();
    const data = addMemberSchema.parse(body);

    // 招待対象ユーザーの存在確認（admin/staff のみ招待可能）
    const targetUser = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, userName: true, userRole: true },
    });

    if (!targetUser) throw ApiError.notFound('ユーザーが見つかりません');
    if (!['admin', 'staff'].includes(targetUser.userRole)) {
      throw ApiError.badRequest('管理者またはスタッフのみボードに招待できます');
    }

    // 既にメンバーかチェック
    const alreadyMember = board.members.some((m) => m.userId === data.userId);
    if (alreadyMember) {
      throw ApiError.conflict('このユーザーは既にボードのメンバーです');
    }

    const member = await prisma.taskBoardMember.create({
      data: {
        boardId,
        userId: data.userId,
        role: 'member',
      },
      include: {
        user: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          userId: member.userId,
          userName: member.user.userName,
          role: member.role,
          joinedAt: member.joinedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
