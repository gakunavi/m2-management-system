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

const createColumnSchema = z.object({
  name: z.string().min(1, 'カラム名は必須です').max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, '正しいカラーコードを入力してください')
    .optional()
    .nullable(),
  scope: z.enum(['company', 'business', 'personal', 'board']),
  businessId: z.number().int().positive().optional().nullable(),
  boardId: z.number().int().positive().optional().nullable(),
});

// ============================================
// デフォルトカラム定義
// ============================================

const DEFAULT_COLUMNS = [
  { name: '未着手', color: '#6b7280', sortOrder: 0 },
  { name: '進行中', color: '#3b82f6', sortOrder: 1 },
  { name: '保留', color: '#f59e0b', sortOrder: 2 },
  { name: '完了', color: '#22c55e', sortOrder: 3 },
];

// ============================================
// GET /api/v1/task-columns
// スコープに応じたカラム一覧取得
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }

    const { searchParams } = request.nextUrl;
    const scope = searchParams.get('scope') ?? 'company';
    const businessIdParam = searchParams.get('businessId');
    const boardIdParam = searchParams.get('boardId');

    // スコープ別のwhere条件を構築
    const where: Record<string, unknown> = { scope };

    if (scope === 'business') {
      if (!businessIdParam) throw ApiError.badRequest('事業IDが必要です');
      where.businessId = parseInt(businessIdParam, 10);
    } else if (scope === 'personal') {
      where.createdById = user.id;
    } else if (scope === 'board') {
      if (!boardIdParam) throw ApiError.badRequest('ボードIDが必要です');
      where.boardId = parseInt(boardIdParam, 10);
    }

    let columns = await prisma.taskColumn.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    // カラムが0件の場合、デフォルト列を自動作成
    if (columns.length === 0) {
      await prisma.taskColumn.createMany({
        data: DEFAULT_COLUMNS.map((col) => ({
          ...col,
          scope,
          businessId: scope === 'business' && businessIdParam
            ? parseInt(businessIdParam, 10)
            : null,
          boardId: scope === 'board' && boardIdParam
            ? parseInt(boardIdParam, 10)
            : null,
          createdById: user.id,
        })),
      });

      columns = await prisma.taskColumn.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: { select: { tasks: true } },
        },
      });
    }

    const data = columns.map((col) => ({
      id: col.id,
      name: col.name,
      color: col.color,
      sortOrder: col.sortOrder,
      scope: col.scope,
      businessId: col.businessId,
      boardId: col.boardId,
      createdById: col.createdById,
      taskCount: col._count.tasks,
      createdAt: col.createdAt.toISOString(),
      updatedAt: col.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/task-columns
// カラム新規作成
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const { name, color, scope, businessId, boardId } = createColumnSchema.parse(body);

    // scope が 'business' の場合は businessId が必須
    if (scope === 'business' && !businessId) {
      throw ApiError.badRequest('事業スコープの場合は事業IDが必要です');
    }
    if (scope === 'board' && !boardId) {
      throw ApiError.badRequest('ボードスコープの場合はボードIDが必要です');
    }

    // 同スコープ内の最大sortOrderを取得
    const maxSortOrder = await prisma.taskColumn.aggregate({
      where: {
        scope,
        ...(scope === 'business' && businessId ? { businessId } : {}),
        ...(scope === 'personal' ? { createdById: user.id } : {}),
        ...(scope === 'board' && boardId ? { boardId } : {}),
      },
      _max: { sortOrder: true },
    });

    const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

    const column = await prisma.taskColumn.create({
      data: {
        name,
        color: color ?? null,
        sortOrder: nextSortOrder,
        scope,
        businessId: businessId ?? null,
        boardId: boardId ?? null,
        createdById: user.id,
      },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: column.id,
          name: column.name,
          color: column.color,
          sortOrder: column.sortOrder,
          scope: column.scope,
          businessId: column.businessId,
          boardId: column.boardId,
          createdById: column.createdById,
          taskCount: column._count.tasks,
          createdAt: column.createdAt.toISOString(),
          updatedAt: column.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
