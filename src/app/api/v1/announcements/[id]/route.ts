import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// バリデーション
// ============================================

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  priority: z.enum(['normal', 'important', 'urgent']).optional(),
  targetScope: z.enum(['internal', 'all']).optional(),
  businessId: z.number().int().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

// ============================================
// GET /api/v1/announcements/:id
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const announcementId = parseInt(id, 10);
    if (isNaN(announcementId)) throw ApiError.notFound('お知らせが見つかりません');

    const announcement = await prisma.announcement.findUnique({
      where: { id: announcementId },
      include: {
        author: { select: { id: true, userName: true } },
        business: { select: { id: true, businessName: true } },
      },
    });
    if (!announcement) throw ApiError.notFound('お知らせが見つかりません');

    return NextResponse.json({
      success: true,
      data: {
        id: announcement.id,
        businessId: announcement.businessId,
        title: announcement.title,
        content: announcement.content,
        priority: announcement.priority,
        targetScope: announcement.targetScope,
        publishedAt: announcement.publishedAt?.toISOString() ?? null,
        expiresAt: announcement.expiresAt?.toISOString() ?? null,
        createdBy: announcement.createdBy,
        createdAt: announcement.createdAt.toISOString(),
        updatedAt: announcement.updatedAt.toISOString(),
        author: announcement.author,
        business: announcement.business,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/announcements/:id
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
    const announcementId = parseInt(id, 10);
    if (isNaN(announcementId)) throw ApiError.notFound('お知らせが見つかりません');

    const existing = await prisma.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!existing) throw ApiError.notFound('お知らせが見つかりません');

    const body = await request.json();
    const data = updateAnnouncementSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.targetScope !== undefined) updateData.targetScope = data.targetScope;
    if (data.businessId !== undefined) updateData.businessId = data.businessId;
    if (data.publishedAt !== undefined) {
      updateData.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
    }
    if (data.expiresAt !== undefined) {
      updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    }

    const updated = await prisma.announcement.update({
      where: { id: announcementId },
      data: updateData,
      include: {
        author: { select: { id: true, userName: true } },
        business: { select: { id: true, businessName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        businessId: updated.businessId,
        title: updated.title,
        content: updated.content,
        priority: updated.priority,
        targetScope: updated.targetScope,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        author: updated.author,
        business: updated.business,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/announcements/:id
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const announcementId = parseInt(id, 10);
    if (isNaN(announcementId)) throw ApiError.notFound('お知らせが見つかりません');

    const existing = await prisma.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!existing) throw ApiError.notFound('お知らせが見つかりません');

    await prisma.announcement.delete({ where: { id: announcementId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
