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

const patchSchema = z.object({
  name: z.string().min(1, 'タグ名は必須です').max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, '正しいカラーコードを入力してください')
    .optional(),
});

// ============================================
// PATCH /api/v1/task-tags/[id]
// タグ更新（名前・カラー）
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }

    const userId = user.id;
    const { id } = await params;
    const tagId = parseInt(id, 10);
    if (isNaN(tagId)) throw ApiError.badRequest('不正なIDです');

    const existing = await prisma.taskTag.findUnique({ where: { id: tagId } });
    if (!existing) throw ApiError.notFound('タグが見つかりません');

    // 権限チェック: 自分のタグは編集可能、共有タグは admin のみ編集可能
    const isOwner = existing.ownerId === userId;
    const isAdmin = user.role === 'admin';
    const isShared = existing.scope === 'shared';

    if (!isOwner && !(isAdmin && isShared)) {
      throw ApiError.forbidden('このタグを編集する権限がありません');
    }

    const body = await request.json();
    const patch = patchSchema.parse(body);

    // 共有タグの名前変更時、重複チェック
    if (patch.name !== undefined && patch.name !== existing.name && existing.scope === 'shared') {
      const duplicate = await prisma.taskTag.findFirst({
        where: {
          name: { equals: patch.name, mode: 'insensitive' },
          scope: 'shared',
          id: { not: tagId },
        },
      });
      if (duplicate) {
        throw ApiError.conflict('同じ名前の共有タグが既に存在します');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.color !== undefined) updateData.color = patch.color;

    const updated = await prisma.taskTag.update({
      where: { id: tagId },
      data: updateData,
      include: {
        owner: { select: { userName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        color: updated.color,
        scope: updated.scope,
        ownerId: updated.ownerId,
        ownerName: updated.owner.userName,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/task-tags/[id]
// タグ削除（TaskTagOnTask は onDelete: Cascade で自動削除）
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      throw ApiError.forbidden();
    }

    const userId = user.id;
    const { id } = await params;
    const tagId = parseInt(id, 10);
    if (isNaN(tagId)) throw ApiError.badRequest('不正なIDです');

    const existing = await prisma.taskTag.findUnique({ where: { id: tagId } });
    if (!existing) throw ApiError.notFound('タグが見つかりません');

    // 権限チェック: 自分のタグは削除可能、共有タグは admin のみ削除可能
    const isOwner = existing.ownerId === userId;
    const isAdmin = user.role === 'admin';
    const isShared = existing.scope === 'shared';

    if (!isOwner && !(isAdmin && isShared)) {
      throw ApiError.forbidden('このタグを削除する権限がありません');
    }

    await prisma.taskTag.delete({ where: { id: tagId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
