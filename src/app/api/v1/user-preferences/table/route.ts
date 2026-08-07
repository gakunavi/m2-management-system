import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { persistedColumnSettingsSchema } from '@/lib/table-settings-schema';
import type { Prisma } from '@prisma/client';

// ============================================
// バリデーションスキーマ
// ============================================

// 列設定のスキーマは saved-views と共有する
// （片方だけにフィールドを足すと zod がキーを黙って削除し、設定が保存されない）
const putSchema = z.object({
  tableKey: z.string().min(1).max(100),
  settings: persistedColumnSettingsSchema,
});

// ============================================
// GET /api/v1/user-preferences/table?tableKey=xxx
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const tableKey = request.nextUrl.searchParams.get('tableKey');
    if (!tableKey) throw ApiError.badRequest('tableKey が必要です');

    const pref = await prisma.userTablePreference.findUnique({
      where: { userId_tableKey: { userId: user.id, tableKey } },
    });

    return NextResponse.json({ success: true, data: pref });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PUT /api/v1/user-preferences/table
// ============================================

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const body = await request.json();
    const { tableKey, settings } = putSchema.parse(body);

    const pref = await prisma.userTablePreference.upsert({
      where: { userId_tableKey: { userId: user.id, tableKey } },
      create: {
        userId: user.id,
        tableKey,
        settings: settings as Prisma.InputJsonValue,
      },
      update: {
        settings: settings as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, data: pref });
  } catch (error) {
    return handleApiError(error);
  }
}
