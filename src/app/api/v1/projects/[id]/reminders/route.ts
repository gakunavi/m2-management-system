import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// バリデーション
// ============================================

const createReminderSchema = z.object({
  assignedTo: z.number().int(),
  reminderDate: z.string().min(1, 'リマインダー日は必須です'),
  title: z.string().min(1, 'タイトルは必須です').max(200),
  description: z.string().max(10000).nullable().optional(),
  notifyEmail: z.boolean().optional().default(false),
});

// ============================================
// GET /api/v1/projects/:id/reminders
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

    const reminders = await prisma.projectReminder.findMany({
      where: { projectId },
      include: {
        assignee: { select: { id: true, userName: true } },
        creator: { select: { id: true, userName: true } },
      },
      orderBy: [
        { isCompleted: 'asc' },
        { reminderDate: 'asc' },
      ],
    });

    const data = reminders.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      assignedTo: r.assignedTo,
      reminderDate: r.reminderDate.toISOString().split('T')[0],
      title: r.title,
      description: r.description,
      notifyEmail: r.notifyEmail,
      isCompleted: r.isCompleted,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      assignee: r.assignee,
      creator: r.creator,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/projects/:id/reminders
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

    // 案件存在チェック
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw ApiError.notFound('案件が見つかりません');

    const body = await request.json();
    const data = createReminderSchema.parse(body);

    const created = await prisma.projectReminder.create({
      data: {
        projectId,
        assignedTo: data.assignedTo,
        reminderDate: new Date(data.reminderDate),
        title: data.title,
        description: data.description ?? null,
        notifyEmail: data.notifyEmail,
        createdBy: user.id,
      },
      include: {
        assignee: { select: { id: true, userName: true } },
        creator: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        projectId: created.projectId,
        assignedTo: created.assignedTo,
        reminderDate: created.reminderDate.toISOString().split('T')[0],
        title: created.title,
        description: created.description,
        notifyEmail: created.notifyEmail,
        isCompleted: created.isCompleted,
        completedAt: null,
        createdBy: created.createdBy,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        assignee: created.assignee,
        creator: created.creator,
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
