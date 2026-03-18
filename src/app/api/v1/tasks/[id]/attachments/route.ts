import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// ============================================
// 定数
// ============================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS_PER_TASK = 10;

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
];

// ============================================
// GET /api/v1/tasks/[id]/attachments
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
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) throw ApiError.notFound('タスクが見つかりません');

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });
    if (!task) throw ApiError.notFound('タスクが見つかりません');

    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId },
      include: {
        uploadedBy: { select: { userName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileKey: a.fileKey,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        uploadedById: a.uploadedById,
        uploaderName: a.uploadedBy?.userName ?? '',
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/tasks/[id]/attachments
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
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) throw ApiError.notFound('タスクが見つかりません');

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        _count: { select: { attachments: true } },
      },
    });
    if (!task) throw ApiError.notFound('タスクが見つかりません');

    // 添付ファイル上限チェック
    if (task._count.attachments >= MAX_ATTACHMENTS_PER_TASK) {
      throw ApiError.badRequest(
        `添付ファイルは最大${MAX_ATTACHMENTS_PER_TASK}件までです`,
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw ApiError.badRequest('ファイルが指定されていません');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw ApiError.badRequest(
        'PDF、Word、Excel、画像（JPEG/PNG/GIF/WebP）、ZIP、テキスト形式のファイルのみアップロードできます',
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw ApiError.badRequest('ファイルサイズが上限（10MB）を超えています');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageAdapter();
    const directory = `task-attachments/${taskId}`;
    const result = await storage.upload(buffer, file.name, file.type, directory);

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        fileName: file.name,
        fileKey: result.key,
        fileSize: file.size,
        mimeType: file.type,
        uploadedById: user.id,
      },
      include: {
        uploadedBy: { select: { userName: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: attachment.id,
          fileName: attachment.fileName,
          fileKey: attachment.fileKey,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          uploadedById: attachment.uploadedById,
          uploaderName: attachment.uploadedBy?.userName ?? '',
          createdAt: attachment.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
