import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { createNotificationsForUsers } from '@/lib/notification-helper';

// ============================================
// POST /api/v1/businesses/:id/documents/:documentId/notify
// ドキュメント通知送信（admin/staff専用）
// ============================================

type Params = { params: Promise<{ id: string; documentId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, documentId } = await params;
    const businessId = parseInt(id, 10);
    const docId = parseInt(documentId, 10);

    // ドキュメント取得（business リレーション含む）
    const doc = await prisma.businessDocument.findUnique({
      where: { id: docId },
      include: {
        business: { select: { id: true, businessName: true } },
      },
    });

    if (!doc || doc.businessId !== businessId) {
      throw ApiError.notFound('ドキュメントが見つかりません');
    }

    // 送信先ユーザー決定
    let recipientUserIds: number[] = [];

    if (doc.documentType === 'material') {
      // 資料 → 事業に紐づく全代理店ユーザー
      const activeLinks = await prisma.partnerBusinessLink.findMany({
        where: { businessId, linkStatus: 'active' },
        select: { partnerId: true },
      });
      const partnerIds = Array.from(new Set(activeLinks.map((l) => l.partnerId)));

      if (partnerIds.length > 0) {
        const users = await prisma.user.findMany({
          where: {
            userPartnerId: { in: partnerIds },
            userRole: { in: ['partner_admin', 'partner_staff'] },
            userIsActive: true,
          },
          select: { id: true },
        });
        recipientUserIds = users.map((u) => u.id);
      }
    } else if (doc.documentType === 'invoice') {
      // 明細 → 対象代理店のユーザーのみ
      if (doc.partnerId) {
        const users = await prisma.user.findMany({
          where: {
            userPartnerId: doc.partnerId,
            userRole: { in: ['partner_admin', 'partner_staff'] },
            userIsActive: true,
          },
          select: { id: true },
        });
        recipientUserIds = users.map((u) => u.id);
      }
    }

    // 最終通知日時を更新
    const now = new Date();
    await prisma.businessDocument.update({
      where: { id: docId },
      data: {
        lastNotifiedAt: now,
        lastNotifiedBy: user.id,
      },
    });

    // 通知送信（DB + メール非同期）
    if (recipientUserIds.length > 0) {
      const typeLabel = doc.documentType === 'material' ? '資料' : '支払明細書';
      createNotificationsForUsers(recipientUserIds, {
        type: 'document_notification',
        title: `${typeLabel}が共有されました`,
        message: `${doc.business.businessName}の${typeLabel}「${doc.documentTitle}」が共有されました。ポータルからご確認ください。`,
        relatedEntity: 'business_document',
        relatedEntityId: doc.id,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        notifiedAt: now.toISOString(),
        recipientCount: recipientUserIds.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
