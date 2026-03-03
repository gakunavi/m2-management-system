import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

// ============================================
// 定数
// ============================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/zip',
];

// ============================================
// GET /api/v1/projects/:id/files
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        business: { select: { businessConfig: true } },
      },
    });
    if (!project) throw ApiError.notFound('案件が見つかりません');

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const files = await prisma.projectFile.findMany({
      where: {
        projectId,
        ...(category ? { fileCategory: category } : {}),
      },
      include: {
        creator: {
          select: { id: true, userName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = files.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      fileName: f.fileName,
      fileStorageKey: f.fileStorageKey,
      fileUrl: f.fileUrl,
      fileSize: f.fileSize,
      fileMimeType: f.fileMimeType,
      fileCategory: f.fileCategory,
      fileDescription: f.fileDescription,
      createdAt: f.createdAt.toISOString(),
      createdBy: f.createdBy,
      creator: f.creator,
    }));

    // businessConfig から fileCategories を取得
    const config = (project.business?.businessConfig ?? {}) as Record<string, unknown>;
    const fileCategories = Array.isArray(config.fileCategories) ? config.fileCategories : [];

    return NextResponse.json({ success: true, data, fileCategories });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/projects/:id/files
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw ApiError.notFound('案件が見つかりません');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string | null) ?? null;
    const description = (formData.get('description') as string | null) ?? null;

    if (!file) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルが指定されていません', 400);
    }

    // MIME タイプ検証
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'PDF、Word、Excel、JPEG、PNG、WebP、ZIP 形式のファイルのみアップロードできます',
        400,
      );
    }

    // ファイルサイズ検証
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'ファイルサイズが上限（10MB）を超えています',
        400,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageAdapter();
    const result = await storage.upload(buffer, file.name, file.type, `project-files/${projectId}`);

    const created = await prisma.projectFile.create({
      data: {
        projectId,
        fileName: file.name,
        fileStorageKey: result.key,
        fileUrl: result.url,
        fileSize: file.size,
        fileMimeType: file.type,
        fileCategory: category,
        fileDescription: description,
        createdBy: user.id,
      },
      include: {
        creator: {
          select: { id: true, userName: true },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          projectId: created.projectId,
          fileName: created.fileName,
          fileStorageKey: created.fileStorageKey,
          fileUrl: created.fileUrl,
          fileSize: created.fileSize,
          fileMimeType: created.fileMimeType,
          fileCategory: created.fileCategory,
          fileDescription: created.fileDescription,
          createdAt: created.createdAt.toISOString(),
          createdBy: created.createdBy,
          creator: created.creator,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
