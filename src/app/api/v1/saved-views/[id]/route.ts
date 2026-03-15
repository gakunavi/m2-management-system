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

const patchSchema = z.object({
  viewName: z.string().min(1).max(100).optional(),
  settings: savedViewSettingsSchema.optional(),
  displayOrder: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
});

// ============================================
// PATCH /api/v1/saved-views/[id]
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const { id: idStr } = await params;
    const viewId = parseInt(idStr, 10);
    if (isNaN(viewId)) throw ApiError.badRequest('不正なIDです');

    // 所有者チェック
    const existing = await prisma.savedTableView.findUnique({
      where: { id: viewId },
    });
    if (!existing) throw ApiError.notFound();
    if (existing.userId !== user.id) throw ApiError.forbidden();

    const body = await request.json();
    const patch = patchSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (patch.viewName !== undefined) updateData.viewName = patch.viewName;
    if (patch.settings !== undefined)
      updateData.settings = patch.settings as Prisma.InputJsonValue;
    if (patch.displayOrder !== undefined)
      updateData.displayOrder = patch.displayOrder;
    if (patch.isDefault !== undefined) updateData.isDefault = patch.isDefault;
    if (patch.isShared !== undefined) updateData.isShared = patch.isShared;

    const updated = await prisma.$transaction(async (tx) => {
      // デフォルト設定時は既存のデフォルトを解除
      if (patch.isDefault === true) {
        await tx.savedTableView.updateMany({
          where: {
            userId: user.id,
            tableKey: existing.tableKey,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }
      return tx.savedTableView.update({
        where: { id: viewId },
        data: updateData,
      });
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/saved-views/[id]
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number };
    const { id: idStr } = await params;
    const viewId = parseInt(idStr, 10);
    if (isNaN(viewId)) throw ApiError.badRequest('不正なIDです');

    const existing = await prisma.savedTableView.findUnique({
      where: { id: viewId },
    });
    if (!existing) throw ApiError.notFound();
    if (existing.userId !== user.id) throw ApiError.forbidden();

    await prisma.savedTableView.delete({ where: { id: viewId } });

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return handleApiError(error);
  }
}
