import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/zip',
];

const INCLUDE_CREATOR = {
  creator: { select: { id: true, userName: true } },
} as const;

type Params = { params: Promise<{ id: string; documentId: string }> };

async function resolveParams(params: Params['params']) {
  const { id, documentId } = await params;
  return { businessId: parseInt(id, 10), docId: parseInt(documentId, 10) };
}

async function requireAdminStaff() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw ApiError.unauthorized();
  const user = session.user as { id: number; role: string };
  if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();
  return user;
}

async function findDocument(docId: number, businessId: number) {
  const doc = await prisma.businessDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.businessId !== businessId) {
    throw ApiError.notFound('ドキュメントが見つかりません');
  }
  return doc;
}

function serializeDocument(doc: Record<string, unknown>) {
  return {
    id: doc.id,
    businessId: doc.businessId,
    documentType: doc.documentType,
    documentTitle: doc.documentTitle,
    fileName: doc.fileName,
    fileStorageKey: doc.fileStorageKey,
    fileUrl: doc.fileUrl,
    fileSize: doc.fileSize,
    fileMimeType: doc.fileMimeType,
    targetMonth: doc.targetMonth,
    documentDescription: doc.documentDescription,
    isPublic: doc.isPublic,
    documentSortOrder: doc.documentSortOrder,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
    createdBy: doc.createdBy,
    lastNotifiedAt: doc.lastNotifiedAt instanceof Date ? doc.lastNotifiedAt.toISOString() : doc.lastNotifiedAt ?? null,
    lastNotifiedBy: doc.lastNotifiedBy ?? null,
    creator: doc.creator,
  };
}

// ============================================
// PUT /api/v1/businesses/:id/documents/:documentId
// 編集（タイトル・公開状態・ファイル差し替え）
// ============================================

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAdminStaff();
    const { businessId, docId } = await resolveParams(params);
    const existing = await findDocument(docId, businessId);

    const formData = await request.formData();
    const documentTitle = (formData.get('documentTitle') as string | null)?.trim() ?? '';
    const targetMonth = (formData.get('targetMonth') as string | null) ?? null;
    const documentDescription = (formData.get('documentDescription') as string | null)?.trim() || null;
    const isPublicStr = formData.get('isPublic') as string | null;
    const isPublic = isPublicStr !== null ? isPublicStr !== 'false' : existing.isPublic;
    const file = formData.get('file') as File | null;

    if (!documentTitle) throw new ApiError('VALIDATION_ERROR', 'タイトルは必須です', 400);
    if (existing.documentType === 'invoice') {
      if (!targetMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
        throw new ApiError('VALIDATION_ERROR', '対象年月を正しい形式（YYYY-MM）で入力してください', 400);
      }
    }

    const updateData: Record<string, unknown> = {
      documentTitle,
      documentDescription,
      isPublic,
    };
    if (existing.documentType === 'invoice') {
      updateData.targetMonth = targetMonth;
    }

    // ファイル差し替え
    if (file) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        throw new ApiError('VALIDATION_ERROR', 'PDF、Word、Excel、画像、CSV、ZIP 形式のファイルのみアップロードできます', 400);
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new ApiError('VALIDATION_ERROR', 'ファイルサイズが上限（10MB）を超えています', 400);
      }

      const storage = getStorageAdapter();
      // 旧ファイルを削除
      await storage.delete(existing.fileStorageKey);
      // 新ファイルをアップロード
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await storage.upload(buffer, file.name, file.type, `business-documents/${businessId}/${existing.documentType}`);

      updateData.fileName = file.name;
      updateData.fileStorageKey = result.key;
      updateData.fileUrl = result.url;
      updateData.fileSize = file.size;
      updateData.fileMimeType = file.type;
    }

    const updated = await prisma.businessDocument.update({
      where: { id: docId },
      data: updateData,
      include: INCLUDE_CREATOR,
    });

    return NextResponse.json({ success: true, data: serializeDocument(updated as unknown as Record<string, unknown>) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/businesses/:id/documents/:documentId
// 公開状態の切り替え
// ============================================

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireAdminStaff();
    const { businessId, docId } = await resolveParams(params);
    await findDocument(docId, businessId);

    const body = await request.json() as { isPublic?: boolean };
    if (typeof body.isPublic !== 'boolean') {
      throw new ApiError('VALIDATION_ERROR', 'isPublic は boolean で指定してください', 400);
    }

    const updated = await prisma.businessDocument.update({
      where: { id: docId },
      data: { isPublic: body.isPublic },
      include: INCLUDE_CREATOR,
    });

    return NextResponse.json({ success: true, data: serializeDocument(updated as unknown as Record<string, unknown>) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/businesses/:id/documents/:documentId
// ============================================

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireAdminStaff();
    const { businessId, docId } = await resolveParams(params);
    const doc = await findDocument(docId, businessId);

    const storage = getStorageAdapter();
    await storage.delete(doc.fileStorageKey);
    await prisma.businessDocument.delete({ where: { id: docId } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
