import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// 入力バリデーション
// ============================================

const updateCommentSchema = z.object({
  commentText: z.string().min(1, 'コメント内容は必須です').max(10000),
});

// ============================================
// PATCH /api/v1/projects/:id/comments/:commentId
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, commentId } = await params;
    const projectId = parseInt(id, 10);
    const commentIdInt = parseInt(commentId, 10);
    if (isNaN(projectId) || isNaN(commentIdInt)) throw ApiError.notFound('コメントが見つかりません');

    const comment = await prisma.projectComment.findUnique({
      where: { id: commentIdInt },
    });
    if (!comment || comment.projectId !== projectId) {
      throw ApiError.notFound('コメントが見つかりません');
    }

    const body = await request.json();
    const data = updateCommentSchema.parse(body);

    const updated = await prisma.projectComment.update({
      where: { id: commentIdInt },
      data: { commentText: data.commentText },
      include: {
        creator: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        projectId: updated.projectId,
        commentText: updated.commentText,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        createdBy: updated.createdBy,
        creator: updated.creator,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/projects/:id/comments/:commentId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, commentId } = await params;
    const projectId = parseInt(id, 10);
    const commentIdInt = parseInt(commentId, 10);
    if (isNaN(projectId) || isNaN(commentIdInt)) throw ApiError.notFound('コメントが見つかりません');

    const comment = await prisma.projectComment.findUnique({
      where: { id: commentIdInt },
    });
    if (!comment || comment.projectId !== projectId) {
      throw ApiError.notFound('コメントが見つかりません');
    }

    await prisma.projectComment.delete({ where: { id: commentIdInt } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
