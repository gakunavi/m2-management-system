import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  generateBusinessTierNumber,
  validateBusinessTierHierarchy,
  detectBusinessCircularReference,
  recalculateBusinessDescendantTierNumbers,
  clearBusinessHierarchyDescendants,
} from '@/lib/business-partner-hierarchy';

// ============================================
// PATCH /api/v1/partners/:id/business-links/:linkId
// ============================================

const updateLinkSchema = z.object({
  linkStatus: z.string().max(20).optional(),
  commissionRate: z.number().min(0).max(100).nullable().optional(),
  contactPerson: z.string().max(100).nullable().optional(),
  linkCustomData: z.record(z.unknown()).optional(),
  businessTier: z.string().max(50).nullable().optional(),
  businessParentId: z.number().int().positive().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, linkId } = await params;
    const partnerId = parseInt(id, 10);
    const linkIdNum = parseInt(linkId, 10);
    if (isNaN(partnerId) || isNaN(linkIdNum)) throw ApiError.notFound('事業リンクが見つかりません');

    const existing = await prisma.partnerBusinessLink.findFirst({
      where: { id: linkIdNum, partnerId },
    });
    if (!existing) throw ApiError.notFound('事業リンクが見つかりません');

    const body = await request.json();
    const data = updateLinkSchema.parse(body);

    // 階層変更の有無を判定
    const tierChanged = data.businessTier !== undefined;
    const parentChanged = data.businessParentId !== undefined;

    if (tierChanged || parentChanged) {
      // 階層変更はトランザクション内で処理
      let newTier = tierChanged ? data.businessTier ?? null : existing.businessTier;
      let newParentId = parentChanged ? data.businessParentId ?? null : existing.businessParentId;

      // 1次代理店は親を持てない
      if (newTier === '1次代理店') {
        newParentId = null;
      }

      await prisma.$transaction(async (tx) => {
        // 親代理店が指定された場合、階層を自動判定（N次対応）
        if (newParentId) {
          const parentLink = await tx.partnerBusinessLink.findFirst({
            where: { businessId: existing.businessId, partnerId: newParentId },
            select: { businessTier: true },
          });
          if (!parentLink?.businessTier) {
            throw ApiError.badRequest('指定された親代理店はこの事業で階層が設定されていません');
          }
          const parentMatch = parentLink.businessTier.match(/^(\d+)次代理店$/);
          if (!parentMatch) {
            throw ApiError.badRequest('親代理店の階層ラベルが不正です');
          }
          const parentDepth = parseInt(parentMatch[1], 10);
          newTier = `${parentDepth + 1}次代理店`;
        }

        // バリデーション
        const tierError = await validateBusinessTierHierarchy(tx, existing.businessId, newTier, newParentId);
        if (tierError) throw ApiError.badRequest(tierError);

        // 循環参照チェック
        if (newParentId) {
          const isCircular = await detectBusinessCircularReference(tx, existing.businessId, partnerId, newParentId);
          if (isCircular) throw ApiError.badRequest('循環参照が検出されました');
        }

        // 階層番号生成
        const businessTierNumber = await generateBusinessTierNumber(tx, existing.businessId, newTier, newParentId);

        // 更新
        await tx.partnerBusinessLink.update({
          where: { id: linkIdNum },
          data: {
            ...(data.linkStatus !== undefined ? { linkStatus: data.linkStatus } : {}),
            ...(data.commissionRate !== undefined ? { commissionRate: data.commissionRate } : {}),
            ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson } : {}),
            ...(data.linkCustomData !== undefined ? { linkCustomData: data.linkCustomData as Prisma.InputJsonValue } : {}),
            businessTier: newTier,
            businessTierNumber,
            businessParentId: newParentId,
          },
        });

        // 子孫の階層番号を再計算
        await recalculateBusinessDescendantTierNumbers(tx, existing.businessId, partnerId);
      });
    } else {
      // 階層以外のフィールドのみ更新
      await prisma.partnerBusinessLink.update({
        where: { id: linkIdNum },
        data: {
          ...(data.linkStatus !== undefined ? { linkStatus: data.linkStatus } : {}),
          ...(data.commissionRate !== undefined ? { commissionRate: data.commissionRate } : {}),
          ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson } : {}),
          ...(data.linkCustomData !== undefined ? { linkCustomData: data.linkCustomData as Prisma.InputJsonValue } : {}),
        },
      });
    }

    const updated = await prisma.partnerBusinessLink.findUnique({
      where: { id: linkIdNum },
      include: {
        business: { select: { businessName: true, businessCode: true } },
        businessParent: { select: { id: true, partnerCode: true, partnerName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated!.id,
        partnerId: updated!.partnerId,
        businessId: updated!.businessId,
        businessName: updated!.business.businessName,
        businessCode: updated!.business.businessCode,
        linkStatus: updated!.linkStatus,
        commissionRate: updated!.commissionRate != null ? Number(updated!.commissionRate) : null,
        contactPerson: updated!.contactPerson,
        linkCustomData: updated!.linkCustomData,
        businessTier: updated!.businessTier,
        businessTierNumber: updated!.businessTierNumber,
        businessParentId: updated!.businessParentId,
        businessParentName: updated!.businessParent?.partnerName ?? null,
        businessParentCode: updated!.businessParent?.partnerCode ?? null,
        createdAt: updated!.createdAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/partners/:id/business-links/:linkId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, linkId } = await params;
    const partnerId = parseInt(id, 10);
    const linkIdNum = parseInt(linkId, 10);
    if (isNaN(partnerId) || isNaN(linkIdNum)) throw ApiError.notFound('事業リンクが見つかりません');

    const existing = await prisma.partnerBusinessLink.findFirst({
      where: { id: linkIdNum, partnerId },
    });
    if (!existing) throw ApiError.notFound('事業リンクが見つかりません');

    // トランザクション内で子孫クリーンアップ + 削除
    await prisma.$transaction(async (tx) => {
      await clearBusinessHierarchyDescendants(tx, existing.businessId, partnerId);
      await tx.partnerBusinessLink.delete({ where: { id: linkIdNum } });
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
