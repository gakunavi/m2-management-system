import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// バリデーションスキーマ
// ============================================

const createSchema = z.object({
  name: z.string().min(1, 'タグ名は必須です').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '正しいカラーコードを入力してください'),
  scope: z.enum(['shared', 'personal']),
});

// ============================================
// GET /api/v1/task-tags
// 共有タグ + 自分のパーソナルタグ一覧を返す
// ============================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }

    const userId = user.id;

    const tags = await prisma.taskTag.findMany({
      where: {
        OR: [
          { scope: 'shared' },
          { scope: 'personal', ownerId: userId },
        ],
      },
      include: {
        owner: { select: { userName: true } },
      },
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });

    const data = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      scope: tag.scope,
      ownerId: tag.ownerId,
      ownerName: tag.owner.userName,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/task-tags
// タグ新規作成
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }

    const userId = user.id;

    const body = await request.json();
    const { name, color, scope } = createSchema.parse(body);

    // 共有タグの場合、同名タグが既に存在しないかチェック（大文字小文字を無視）
    if (scope === 'shared') {
      const existing = await prisma.taskTag.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          scope: 'shared',
        },
      });
      if (existing) {
        throw ApiError.conflict('同じ名前の共有タグが既に存在します');
      }
    }

    const tag = await prisma.taskTag.create({
      data: {
        name,
        color,
        scope,
        ownerId: userId,
      },
      include: {
        owner: { select: { userName: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          scope: tag.scope,
          ownerId: tag.ownerId,
          ownerName: tag.owner.userName,
          createdAt: tag.createdAt.toISOString(),
          updatedAt: tag.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
