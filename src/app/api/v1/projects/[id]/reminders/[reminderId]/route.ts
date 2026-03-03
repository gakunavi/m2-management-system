import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// バリデーション
// ============================================

const updateReminderSchema = z.object({
  assignedTo: z.number().int().optional(),
  reminderDate: z.string().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  notifyEmail: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
});

// ============================================
// PATCH /api/v1/projects/:id/reminders/:reminderId
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reminderId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, reminderId } = await params;
    const projectId = parseInt(id, 10);
    const reminderIdInt = parseInt(reminderId, 10);
    if (isNaN(projectId) || isNaN(reminderIdInt)) {
      throw ApiError.notFound('リマインダーが見つかりません');
    }

    const existing = await prisma.projectReminder.findUnique({
      where: { id: reminderIdInt },
    });
    if (!existing || existing.projectId !== projectId) {
      throw ApiError.notFound('リマインダーが見つかりません');
    }

    const body = await request.json();
    const data = updateReminderSchema.parse(body);

    // 完了フラグ更新時に completedAt を自動設定
    const updateData: Record<string, unknown> = {};
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
    if (data.reminderDate !== undefined) updateData.reminderDate = new Date(data.reminderDate);
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.notifyEmail !== undefined) updateData.notifyEmail = data.notifyEmail;
    if (data.isCompleted !== undefined) {
      updateData.isCompleted = data.isCompleted;
      updateData.completedAt = data.isCompleted ? new Date() : null;
    }

    const updated = await prisma.projectReminder.update({
      where: { id: reminderIdInt },
      data: updateData,
      include: {
        assignee: { select: { id: true, userName: true } },
        creator: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        projectId: updated.projectId,
        assignedTo: updated.assignedTo,
        reminderDate: updated.reminderDate.toISOString().split('T')[0],
        title: updated.title,
        description: updated.description,
        notifyEmail: updated.notifyEmail,
        isCompleted: updated.isCompleted,
        completedAt: updated.completedAt?.toISOString() ?? null,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        assignee: updated.assignee,
        creator: updated.creator,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/projects/:id/reminders/:reminderId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; reminderId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, reminderId } = await params;
    const projectId = parseInt(id, 10);
    const reminderIdInt = parseInt(reminderId, 10);
    if (isNaN(projectId) || isNaN(reminderIdInt)) {
      throw ApiError.notFound('リマインダーが見つかりません');
    }

    const existing = await prisma.projectReminder.findUnique({
      where: { id: reminderIdInt },
    });
    if (!existing || existing.projectId !== projectId) {
      throw ApiError.notFound('リマインダーが見つかりません');
    }

    await prisma.projectReminder.delete({ where: { id: reminderIdInt } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
