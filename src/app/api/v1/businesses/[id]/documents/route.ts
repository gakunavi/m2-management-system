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

const VALID_DOCUMENT_TYPES = ['material', 'invoice'];

// ============================================
// ヘルパー
// ============================================

function serializeDocument(doc: {
  id: number;
  businessId: number;
  documentType: string;
  documentTitle: string;
  fileName: string;
  fileStorageKey: string;
  fileUrl: string;
  fileSize: number;
  fileMimeType: string;
  targetMonth: string | null;
  documentDescription: string | null;
  isPublic: boolean;
  documentSortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  lastNotifiedAt: Date | null;
  lastNotifiedBy: number | null;
  creator: { id: number; userName: string } | null;
}) {
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
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    createdBy: doc.createdBy,
    lastNotifiedAt: doc.lastNotifiedAt?.toISOString() ?? null,
    lastNotifiedBy: doc.lastNotifiedBy,
    creator: doc.creator,
  };
}

const INCLUDE_CREATOR = {
  creator: { select: { id: true, userName: true } },
} as const;

// ============================================
// GET /api/v1/businesses/:id/documents
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const businessId = parseInt(id, 10);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const targetMonth = searchParams.get('targetMonth');

    if (!type || !VALID_DOCUMENT_TYPES.includes(type)) {
      throw new ApiError('VALIDATION_ERROR', 'type パラメータ（material または invoice）は必須です', 400);
    }

    const where: Record<string, unknown> = { businessId, documentType: type };
    if (targetMonth) where.targetMonth = targetMonth;

    const documents = await prisma.businessDocument.findMany({
      where,
      include: INCLUDE_CREATOR,
      orderBy: type === 'invoice'
        ? [{ targetMonth: 'desc' }, { documentSortOrder: 'asc' }]
        : { documentSortOrder: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: documents.map(serializeDocument),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/businesses/:id/documents
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
    const businessId = parseInt(id, 10);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = formData.get('documentType') as string | null;
    const documentTitle = (formData.get('documentTitle') as string | null)?.trim() ?? '';
    const targetMonth = (formData.get('targetMonth') as string | null) ?? null;
    const documentDescription = (formData.get('documentDescription') as string | null)?.trim() || null;
    const isPublic = formData.get('isPublic') !== 'false';

    if (!file) throw new ApiError('VALIDATION_ERROR', 'ファイルが指定されていません', 400);
    if (!documentType || !VALID_DOCUMENT_TYPES.includes(documentType)) {
      throw new ApiError('VALIDATION_ERROR', 'documentType（material または invoice）は必須です', 400);
    }
    if (!documentTitle) throw new ApiError('VALIDATION_ERROR', 'タイトルは必須です', 400);
    if (documentType === 'invoice') {
      if (!targetMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
        throw new ApiError('VALIDATION_ERROR', '対象年月を正しい形式（YYYY-MM）で入力してください', 400);
      }
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new ApiError('VALIDATION_ERROR', 'PDF、Word、Excel、画像、CSV、ZIP 形式のファイルのみアップロードできます', 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルサイズが上限（10MB）を超えています', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageAdapter();
    const result = await storage.upload(buffer, file.name, file.type, `business-documents/${businessId}/${documentType}`);

    // 新規ドキュメントは最後尾に追加
    const maxSortOrder = await prisma.businessDocument.aggregate({
      where: { businessId, documentType },
      _max: { documentSortOrder: true },
    });
    const nextSortOrder = (maxSortOrder._max.documentSortOrder ?? 0) + 1;

    const created = await prisma.businessDocument.create({
      data: {
        businessId,
        documentType,
        documentTitle,
        fileName: file.name,
        fileStorageKey: result.key,
        fileUrl: result.url,
        fileSize: file.size,
        fileMimeType: file.type,
        targetMonth: documentType === 'invoice' ? targetMonth : null,
        documentDescription,
        isPublic,
        createdBy: user.id,
        documentSortOrder: nextSortOrder,
      },
      include: INCLUDE_CREATOR,
    });

    return NextResponse.json({ success: true, data: serializeDocument(created) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
