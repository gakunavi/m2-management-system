import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getStorageAdapter } from '@/lib/storage';

// ============================================
// 定数
// ============================================

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

const INCLUDE_RELATIONS = {
  creator: { select: { id: true, userName: true } },
  business: { select: { id: true, businessName: true } },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeDocument(doc: any) {
  return {
    id: doc.id,
    businessId: doc.businessId,
    partnerId: doc.partnerId,
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
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
    createdBy: doc.createdBy,
    lastNotifiedAt: doc.lastNotifiedAt instanceof Date ? doc.lastNotifiedAt.toISOString() : doc.lastNotifiedAt ?? null,
    lastNotifiedBy: doc.lastNotifiedBy ?? null,
    creator: doc.creator,
    business: doc.business,
  };
}

// ============================================
// GET /api/v1/partners/:id/documents
// 代理店の支払明細書一覧（admin/staff専用）
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
    const partnerId = parseInt(id, 10);

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) throw ApiError.notFound('代理店が見つかりません');

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const targetMonth = searchParams.get('targetMonth');

    const where: Record<string, unknown> = {
      partnerId,
      documentType: 'invoice',
    };
    if (businessId) where.businessId = parseInt(businessId, 10);
    if (targetMonth) where.targetMonth = targetMonth;

    const documents = await prisma.businessDocument.findMany({
      where,
      include: INCLUDE_RELATIONS,
      orderBy: [{ targetMonth: 'desc' }, { createdAt: 'desc' }],
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
// POST /api/v1/partners/:id/documents
// 支払明細書アップロード（admin/staff専用）
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
    const partnerId = parseInt(id, 10);

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) throw ApiError.notFound('代理店が見つかりません');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const businessIdStr = formData.get('businessId') as string | null;
    const documentTitle = (formData.get('documentTitle') as string | null)?.trim() ?? '';
    const targetMonth = (formData.get('targetMonth') as string | null) ?? null;
    const documentDescription = (formData.get('documentDescription') as string | null)?.trim() || null;

    if (!file) throw new ApiError('VALIDATION_ERROR', 'ファイルが指定されていません', 400);
    if (!businessIdStr) throw new ApiError('VALIDATION_ERROR', '事業を選択してください', 400);
    if (!documentTitle) throw new ApiError('VALIDATION_ERROR', 'タイトルは必須です', 400);
    if (!targetMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
      throw new ApiError('VALIDATION_ERROR', '対象年月を正しい形式（YYYY-MM）で入力してください', 400);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new ApiError('VALIDATION_ERROR', 'PDF、Word、Excel、画像、CSV、ZIP 形式のファイルのみアップロードできます', 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルサイズが上限（10MB）を超えています', 400);
    }

    const businessId = parseInt(businessIdStr, 10);
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageAdapter();
    const result = await storage.upload(buffer, file.name, file.type, `business-documents/${businessId}/invoice/${partnerId}`);

    const created = await prisma.businessDocument.create({
      data: {
        businessId,
        partnerId,
        documentType: 'invoice',
        documentTitle,
        fileName: file.name,
        fileStorageKey: result.key,
        fileUrl: result.url,
        fileSize: file.size,
        fileMimeType: file.type,
        targetMonth,
        documentDescription,
        isPublic: true,
        createdBy: user.id,
      },
      include: INCLUDE_RELATIONS,
    });

    return NextResponse.json({ success: true, data: serializeDocument(created) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
