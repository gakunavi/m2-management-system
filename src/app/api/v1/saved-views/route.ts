import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import type { Prisma } from '@prisma/client';

// ============================================
// バリデーションスキーマ
// ============================================

const savedViewSettingsSchema = z.object({
  columnSettings: z.object({
    columnOrder: z.array(z.string()).default([]),
    columnVisibility: z.record(z.string(), z.boolean()).default({}),
    columnWidths: z.record(z.string(), z.number()).default({}),
    sortState: z.array(
      z.object({
        field: z.string(),
        direction: z.enum(['asc', 'desc']),
      }),
    ).default([]),
  }),
  filters: z.record(z.string(), z.string()).default({}),
  sortItems: z.array(
    z.object({
      field: z.string(),
      direction: z.enum(['asc', 'desc']),
    }),
  ).default([]),
  searchQuery: z.string().default(''),
  pageSize: z.number().int().min(1).max(100).default(25),
});

const createSchema = z.object({
  tableKey: z.string().min(1).max(100),
  viewName: z
    .string()
    .min(1, 'ビュー名は必須です')
    .max(100, '100文字以内で入力してください'),
  settings: savedViewSettingsSchema,
  isDefault: z.boolean().optional().default(false),
});

const MAX_VIEWS_PER_TABLE = 10;

// ============================================
// GET /api/v1/saved-views?tableKey=xxx
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const tableKey = request.nextUrl.searchParams.get('tableKey');
    if (!tableKey) throw ApiError.badRequest('tableKey が必要です');

    const views = await prisma.savedTableView.findMany({
      where: { userId: user.id, tableKey },
      orderBy: { displayOrder: 'asc' },
    });

    return NextResponse.json({ success: true, data: views });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/saved-views
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const body = await request.json();
    const { tableKey, viewName, settings, isDefault } = createSchema.parse(body);

    // 上限チェック
    const count = await prisma.savedTableView.count({
      where: { userId: user.id, tableKey },
    });
    if (count >= MAX_VIEWS_PER_TABLE) {
      throw ApiError.badRequest(
        `保存できるビューは1つのテーブルに最大${MAX_VIEWS_PER_TABLE}件です`,
      );
    }

    const view = await prisma.$transaction(async (tx) => {
      // 末尾に追加する displayOrder を算出
      const maxOrder = await tx.savedTableView.aggregate({
        where: { userId: user.id, tableKey },
        _max: { displayOrder: true },
      });
      const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

      // デフォルト設定時は既存のデフォルトを解除
      if (isDefault) {
        await tx.savedTableView.updateMany({
          where: { userId: user.id, tableKey, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.savedTableView.create({
        data: {
          userId: user.id,
          tableKey,
          viewName,
          settings: settings as Prisma.InputJsonValue,
          displayOrder: nextOrder,
          isDefault,
        },
      });
    });

    return NextResponse.json({ success: true, data: view }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
