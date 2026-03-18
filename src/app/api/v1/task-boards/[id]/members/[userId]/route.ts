import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// DELETE /api/v1/task-boards/:id/members/:userId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, userId } = await params;
    const boardId = parseInt(id, 10);
    const targetUserId = parseInt(userId, 10);

    if (isNaN(boardId)) throw ApiError.notFound('ボードが見つかりません');
    if (isNaN(targetUserId)) throw ApiError.notFound('ユーザーが見つかりません');

    // ボード存在確認とメンバー一覧取得
    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        createdById: true,
        members: {
          select: { userId: true, role: true },
        },
      },
    });

    if (!board) throw ApiError.notFound('ボードが見つかりません');

    // 削除対象メンバーの存在確認
    const targetMember = board.members.find((m) => m.userId === targetUserId);
    if (!targetMember) throw ApiError.notFound('指定されたメンバーはこのボードに参加していません');

    const isSelf = user.id === targetUserId;

    if (isSelf) {
      // 自分自身を削除（退出）する場合
      // owner が自分1人しかいない場合は退出不可
      if (targetMember.role === 'owner') {
        const ownerCount = board.members.filter((m) => m.role === 'owner').length;
        if (ownerCount <= 1) {
          throw ApiError.badRequest(
            'オーナーが自分1人の場合は退出できません。別のメンバーにオーナーを譲渡するか、ボードを削除してください。',
          );
        }
      }
    } else {
      // 他者を削除する場合: 作成者または admin のみ
      if (user.role !== 'admin' && board.createdById !== user.id) {
        throw ApiError.forbidden('他のメンバーを削除できるのはボードの作成者または管理者のみです');
      }
    }

    await prisma.taskBoardMember.delete({
      where: {
        boardId_userId: {
          boardId,
          userId: targetUserId,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
