import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { getBusinessPartnerScope } from '@/lib/revenue-helpers';

const VALID_DOCUMENT_TYPES = ['material', 'invoice'];

// ============================================
// GET /api/v1/portal/documents
// 資料共有: isPublic=true & partnerId=null（全代理店共通資料）
// 支払明細書: 自代理店宛のドキュメントのみ
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId: number | null };

    if (!['partner_admin', 'partner_staff'].includes(user.role)) {
      throw ApiError.forbidden();
    }

    const { searchParams } = new URL(request.url);
    const businessIdParam = searchParams.get('businessId');
    const type = searchParams.get('type');
    const targetMonth = searchParams.get('targetMonth');

    if (!type || !VALID_DOCUMENT_TYPES.includes(type)) {
      throw new ApiError('VALIDATION_ERROR', 'type パラメータ（material または invoice）は必須です', 400);
    }
    if (!businessIdParam) {
      throw new ApiError('VALIDATION_ERROR', 'businessId パラメータは必須です', 400);
    }

    const businessId = parseInt(businessIdParam, 10);

    // 代理店ユーザーの事業アクセス確認（PartnerBusinessLink 経由）
    if (!user.partnerId) {
      throw ApiError.forbidden('代理店情報が設定されていません');
    }
    const partnerLink = await prisma.partnerBusinessLink.findFirst({
      where: { partnerId: user.partnerId, businessId, linkStatus: 'active' },
    });
    if (!partnerLink) {
      throw ApiError.forbidden('この事業へのアクセス権限がありません');
    }

    const where: Record<string, unknown> = {
      businessId,
      documentType: type,
    };
    if (targetMonth) where.targetMonth = targetMonth;

    if (type === 'invoice') {
      // 支払明細書: 自代理店宛のみ表示
      if (user.role === 'partner_admin') {
        // partner_admin: 事業別階層で自代理店 + 下位代理店
        const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, businessId);
        where.partnerId = { in: partnerIds };
      } else {
        // partner_staff: 自代理店のみ
        where.partnerId = user.partnerId;
      }
    } else {
      // 資料共有: 公開 & 代理店紐づけなし（共通資料）
      where.isPublic = true;
      where.partnerId = null;
    }

    const documents = await prisma.businessDocument.findMany({
      where,
      include: {
        creator: { select: { id: true, userName: true } },
      },
      orderBy: type === 'invoice'
        ? [{ targetMonth: 'desc' }, { createdAt: 'desc' }]
        : { createdAt: 'desc' },
    });

    const data = documents.map((doc) => ({
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
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      createdBy: doc.createdBy,
      creator: doc.creator,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
