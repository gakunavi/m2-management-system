import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { qaItemSchema } from '@/lib/validations/qa';
import { getStorageAdapter } from '@/lib/storage';
import { logger } from '@/lib/logger';

// ============================================
// GET /api/v1/qa/items/[id]
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as {
      id: number;
      role: string;
      businesses?: { id: number }[];
    };
    const isPartnerRole = ['partner_admin', 'partner_staff'].includes(user.role);

    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) throw ApiError.notFound('QAアイテムが見つかりません');

    const item = await prisma.qaItem.findUnique({
      where: { id: itemId },
      include: {
        category: {
          select: { id: true, categoryName: true },
        },
        business: {
          select: { id: true, businessName: true },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
        },
        creator: {
          select: { id: true, userName: true },
        },
        updater: {
          select: { id: true, userName: true },
        },
      },
    });

    if (!item) throw ApiError.notFound('QAアイテムが見つかりません');

    // パートナーロールは公開済み・公開フラグ立ちのみ参照可能
    if (isPartnerRole) {
      if (item.itemStatus !== 'published' || !item.itemIsPublic) {
        throw ApiError.notFound('QAアイテムが見つかりません');
      }
      // 事業スコープチェック: businessId が null(全社共通) 以外は自分のアクセス可能な事業かチェック
      if (item.businessId !== null) {
        const userBusinessIds = (user.businesses ?? []).map((b) => b.id);
        if (!userBusinessIds.includes(item.businessId)) {
          throw ApiError.notFound('QAアイテムが見つかりません');
        }
      }
    }

    // 閲覧数のインクリメント（fire-and-forget）
    prisma.qaItem
      .update({
        where: { id: itemId },
        data: { itemViewCount: { increment: 1 } },
      })
      .catch((err) => logger.error('Failed to increment viewCount', err, 'QA'));

    return NextResponse.json({
      success: true,
      data: {
        id: item.id,
        categoryId: item.categoryId,
        category: {
          id: item.category.id,
          categoryName: item.category.categoryName,
        },
        businessId: item.businessId,
        businessName: item.business?.businessName ?? null,
        itemTitle: item.itemTitle,
        itemQuestion: item.itemQuestion,
        itemAnswer: item.itemAnswer,
        itemStatus: item.itemStatus,
        itemIsPublic: item.itemIsPublic,
        itemViewCount: item.itemViewCount,
        itemSortOrder: item.itemSortOrder,
        itemPublishedAt: item.itemPublishedAt ? item.itemPublishedAt.toISOString() : null,
        attachments: item.attachments.map((att) => ({
          id: att.id,
          attachmentName: att.attachmentName,
          attachmentOriginalName: att.attachmentOriginalName,
          attachmentUrl: att.attachmentUrl,
          attachmentSize: att.attachmentSize,
          attachmentMimeType: att.attachmentMimeType,
          createdAt: att.createdAt.toISOString(),
        })),
        creator: item.creator
          ? { id: item.creator.id, userName: item.creator.userName }
          : null,
        updater: item.updater
          ? { id: item.updater.id, userName: item.updater.userName }
          : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/qa/items/[id]
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) throw ApiError.notFound('QAアイテムが見つかりません');

    const current = await prisma.qaItem.findUnique({
      where: { id: itemId },
      select: { id: true, itemStatus: true, itemPublishedAt: true },
    });
    if (!current) throw ApiError.notFound('QAアイテムが見つかりません');

    const body = await request.json();
    const data = qaItemSchema.partial().parse(body);

    if (data.categoryId !== undefined) {
      const category = await prisma.qaCategory.findUnique({
        where: { id: data.categoryId },
        select: { id: true, categoryIsActive: true },
      });
      if (!category || !category.categoryIsActive) {
        throw ApiError.notFound('指定されたカテゴリが見つかりません');
      }
    }

    // ステータスが draft → published に変わる場合は itemPublishedAt をセット
    let itemPublishedAt: Date | null | undefined = undefined;
    if (data.itemStatus === 'published' && current.itemStatus !== 'published') {
      itemPublishedAt = new Date();
    } else if (data.itemStatus === 'draft' && current.itemStatus !== 'draft') {
      itemPublishedAt = null;
    }

    const updated = await prisma.qaItem.update({
      where: { id: itemId },
      data: {
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.businessId !== undefined && { businessId: data.businessId ?? null }),
        ...(data.itemTitle !== undefined && { itemTitle: data.itemTitle }),
        ...(data.itemQuestion !== undefined && { itemQuestion: data.itemQuestion }),
        ...(data.itemAnswer !== undefined && { itemAnswer: data.itemAnswer }),
        ...(data.itemStatus !== undefined && { itemStatus: data.itemStatus }),
        ...(data.itemIsPublic !== undefined && { itemIsPublic: data.itemIsPublic }),
        ...(data.itemSortOrder !== undefined && { itemSortOrder: data.itemSortOrder }),
        ...(itemPublishedAt !== undefined && { itemPublishedAt }),
        updatedBy: user.id,
      },
      include: {
        category: {
          select: { id: true, categoryName: true },
        },
        business: {
          select: { id: true, businessName: true },
        },
        creator: {
          select: { id: true, userName: true },
        },
        updater: {
          select: { id: true, userName: true },
        },
        _count: {
          select: { attachments: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        categoryId: updated.categoryId,
        category: {
          id: updated.category.id,
          categoryName: updated.category.categoryName,
        },
        businessId: updated.businessId,
        businessName: updated.business?.businessName ?? null,
        itemTitle: updated.itemTitle,
        itemQuestion: updated.itemQuestion,
        itemAnswer: updated.itemAnswer,
        itemStatus: updated.itemStatus,
        itemIsPublic: updated.itemIsPublic,
        itemViewCount: updated.itemViewCount,
        itemSortOrder: updated.itemSortOrder,
        itemPublishedAt: updated.itemPublishedAt ? updated.itemPublishedAt.toISOString() : null,
        attachmentCount: updated._count.attachments,
        creator: updated.creator
          ? { id: updated.creator.id, userName: updated.creator.userName }
          : null,
        updater: updated.updater
          ? { id: updated.updater.id, userName: updated.updater.userName }
          : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/qa/items/[id]
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    const { id } = await params;
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) throw ApiError.notFound('QAアイテムが見つかりません');

    const item = await prisma.qaItem.findUnique({
      where: { id: itemId },
      include: {
        attachments: {
          select: { id: true, attachmentStorageKey: true },
        },
      },
    });
    if (!item) throw ApiError.notFound('QAアイテムが見つかりません');

    const storage = getStorageAdapter();

    // ストレージからファイルを削除（エラーは無視してDB削除を優先）
    await Promise.allSettled(
      item.attachments.map((att) => storage.delete(att.attachmentStorageKey)),
    );

    // DBから添付ファイルレコードを削除してからアイテムを削除
    await prisma.$transaction([
      prisma.qaAttachment.deleteMany({ where: { qaItemId: itemId } }),
      prisma.qaItem.delete({ where: { id: itemId } }),
    ]);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
