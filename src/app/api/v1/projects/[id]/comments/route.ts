import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// 入力バリデーション
// ============================================

const createCommentSchema = z.object({
  commentText: z.string().min(1, 'コメント内容は必須です').max(10000),
});

// ============================================
// GET /api/v1/projects/:id/comments
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
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) throw ApiError.notFound('案件が見つかりません');

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw ApiError.notFound('案件が見つかりません');

    const comments = await prisma.projectComment.findMany({
      where: { projectId },
      include: {
        creator: { select: { id: true, userName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = comments.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      commentText: c.commentText,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      createdBy: c.createdBy,
      creator: c.creator,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/projects/:id/comments
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
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) throw ApiError.notFound('案件が見つかりません');

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw ApiError.notFound('案件が見つかりません');

    const body = await request.json();
    const data = createCommentSchema.parse(body);

    const created = await prisma.projectComment.create({
      data: {
        projectId,
        commentText: data.commentText,
        createdBy: user.id,
      },
      include: {
        creator: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        projectId: created.projectId,
        commentText: created.commentText,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        createdBy: created.createdBy,
        creator: created.creator,
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
