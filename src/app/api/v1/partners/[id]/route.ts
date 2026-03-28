import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatPartner } from '@/lib/format-partner';
import { getStorageAdapter } from '@/lib/storage';
import { logger } from '@/lib/logger';
import {
  generateTierNumber,
  validateTierHierarchy,
  calculateTierFromParent,
  detectCircularReference,
  recalculateDescendantTierNumbers,
} from '@/lib/partner-hierarchy';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const updatePartnerSchema = z.object({
  partnerTier: z.string().max(50).optional().nullable(),
  parentId: z.number().int().positive().optional().nullable(),
  partnerName: z.string().min(1).max(200).optional(),
  partnerSalutation: z.string().max(100).optional().nullable(),
  partnerType: z.enum(['法人', '個人事業主', '個人', '確認中', '未設定']).optional(),
  partnerPostalCode: z.string().max(10).optional().nullable(),
  partnerAddress: z.string().optional().nullable(),
  partnerPhone: z.string().max(20).optional().nullable(),
  partnerFax: z.string().max(20).optional().nullable(),
  partnerEmail: z.string().email().optional().nullable().or(z.literal('')),
  partnerWebsite: z.string().url().optional().nullable().or(z.literal('')),
  partnerEstablishedDate: z.string().optional().nullable(),
  partnerCorporateNumber: z.string().regex(/^\d{13}$/, '法人番号は13桁の数字で入力してください').optional().nullable().or(z.literal('')),
  partnerInvoiceNumber: z.string().regex(/^T\d{13}$/, 'インボイス番号は「T」+13桁の数字で入力してください').optional().nullable().or(z.literal('')),
  partnerCapital: z.number().int().min(0).optional().nullable(),
  industryId: z.number().int().positive().optional().nullable(),
  partnerBpFormUrl: z.string().optional().nullable().or(z.literal('')),
  partnerBpFormKey: z.string().optional().nullable(),
  partnerFolderUrl: z.string().url().optional().nullable().or(z.literal('')),
  partnerNotes: z.string().optional().nullable(),
  partnerIsActive: z.boolean().optional(),
  version: z.number().int().min(1),
});

const CONTACT_INCLUDE = {
  select: {
    id: true,
    contactName: true,
    contactDepartment: true,
    contactPosition: true,
    contactPhone: true,
    contactEmail: true,
    contactIsRepresentative: true,
    contactIsPrimary: true,
  },
  orderBy: { contactSortOrder: 'asc' as const },
};

// ============================================
// GET /api/v1/partners/:id
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    const { searchParams } = _request.nextUrl;
    const bizIdParam = searchParams.get('businessId');

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        industry: { select: { id: true, industryName: true } },
        parent: { select: { id: true, partnerCode: true, partnerName: true } },
        contacts: CONTACT_INCLUDE,
        businessLinks: {
          where: { linkStatus: 'active' },
          select: {
            businessId: true,
            businessTier: true,
            businessTierNumber: true,
            linkCustomData: true,
          },
        },
      },
    });

    if (!partner) throw ApiError.notFound('代理店が見つかりません');

    const bizId = bizIdParam ? parseInt(bizIdParam, 10) : undefined;
    return NextResponse.json({ success: true, data: formatPartner(partner, bizId) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/partners/:id
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) throw ApiError.unauthorized('セッションが無効です。再ログインしてください。');

    const { id } = await params;
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    const body = await request.json();

    // linkCustomData / partnerCustomData の更新リクエストを先に取り出す（スキーマ外）
    const linkCustomDataPatch = body.linkCustomData as Record<string, unknown> | undefined;
    const partnerCustomDataPatch = body.partnerCustomData as Record<string, unknown> | undefined;
    const linkBusinessId = body.businessId as number | undefined;

    const data = updatePartnerSchema.parse(body);

    const current = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { version: true, partnerIsActive: true, partnerTier: true, parentId: true, partnerName: true, partnerPhone: true, partnerCode: true, partnerCustomData: true },
    });
    if (!current) throw ApiError.notFound('代理店が見つかりません');
    if (!current.partnerIsActive) throw ApiError.notFound('代理店が見つかりません');
    if (current.version !== data.version) {
      throw ApiError.conflict('他のユーザーによって更新されています。画面をリロードしてください。');
    }

    // 名前+電話番号の完全一致 重複チェック（自身を除外）
    const checkName = data.partnerName ?? current.partnerName;
    const checkPhone = data.partnerPhone !== undefined ? data.partnerPhone : current.partnerPhone;
    if (checkName && checkPhone) {
      const duplicate = await prisma.partner.findFirst({
        where: {
          id: { not: partnerId },
          partnerIsActive: true,
          partnerName: checkName,
          partnerPhone: checkPhone,
        },
        select: { id: true, partnerCode: true, partnerName: true },
      });
      if (duplicate) {
        throw ApiError.conflict(
          `同名+同電話番号の代理店が既に存在します（${duplicate.partnerCode}: ${duplicate.partnerName}）`,
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { version: _version, parentId: rawParentId, partnerTier: _ignoredTier, ...updateData } = data;

    // 親代理店の変更判定（N次対応: parentId から tier を自動算出）
    // ※ null → null は変更なしとして扱う（フォームが毎回 parentId: null を送信するため）
    const newParentId = rawParentId !== undefined ? (rawParentId ?? null) : current.parentId;
    const parentChanged = rawParentId !== undefined && newParentId !== current.parentId;

    // 自己参照チェック（自分自身を親に設定できない）
    if (newParentId !== null && newParentId === partnerId) {
      throw new ApiError('VALIDATION_ERROR', '自分自身を親代理店に設定することはできません', 400, [
        { field: 'parentId', message: '自分自身を親代理店に設定することはできません' },
      ]);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 親変更時: tier を自動再算出
      let newTier = current.partnerTier;
      let tierNeedsUpdate = false;
      if (parentChanged) {
        newTier = await calculateTierFromParent(tx, newParentId);
        tierNeedsUpdate = true;
        const effectiveParentId = newTier === '1次代理店' ? null : newParentId;

        const tierError = await validateTierHierarchy(tx, newTier, effectiveParentId);
        if (tierError) {
          throw new ApiError('VALIDATION_ERROR', tierError, 400, [
            { field: 'parentId', message: tierError },
          ]);
        }

        // 循環参照チェック
        if (effectiveParentId) {
          const isCircular = await detectCircularReference(tx, partnerId, effectiveParentId);
          if (isCircular) {
            throw new ApiError('VALIDATION_ERROR', '循環参照が検出されました', 400, [
              { field: 'parentId', message: '指定した親代理店はこの代理店の子孫です' },
            ]);
          }
        }
      } else if (!newParentId && current.partnerTier && current.partnerTier !== '1次代理店') {
        // 整合性修復: parentId が null なのに 2次以上の tier がセットされている不整合を検出しクリア
        newTier = null;
        tierNeedsUpdate = true;
      }

      // tierNumber の再計算
      let partnerTierNumber: string | null | undefined;
      const tierChanged = newTier !== current.partnerTier;
      if (tierChanged || tierNeedsUpdate || parentChanged) {
        const effectiveParentId = newTier === '1次代理店' ? null : newParentId;
        partnerTierNumber = await generateTierNumber(tx, newTier, effectiveParentId, current.partnerCode);
      }

      const result = await tx.partner.update({
        where: { id: partnerId },
        data: {
          ...updateData,
          ...((parentChanged || tierNeedsUpdate) ? { parentId: newTier === '1次代理店' ? null : newParentId } : {}),
          ...((parentChanged || tierNeedsUpdate) ? { partnerTier: newTier } : {}),
          ...(partnerTierNumber !== undefined ? { partnerTierNumber } : {}),
          partnerEstablishedDate:
            updateData.partnerEstablishedDate
              ? new Date(updateData.partnerEstablishedDate)
              : updateData.partnerEstablishedDate,
          partnerEmail: updateData.partnerEmail !== undefined ? (updateData.partnerEmail || null) : undefined,
          partnerWebsite: updateData.partnerWebsite !== undefined ? (updateData.partnerWebsite || null) : undefined,
          partnerCorporateNumber: updateData.partnerCorporateNumber !== undefined ? (updateData.partnerCorporateNumber || null) : undefined,
          partnerInvoiceNumber: updateData.partnerInvoiceNumber !== undefined ? (updateData.partnerInvoiceNumber || null) : undefined,
          partnerCapital: updateData.partnerCapital !== undefined
            ? (updateData.partnerCapital != null ? BigInt(updateData.partnerCapital) : null)
            : undefined,
          partnerBpFormUrl: updateData.partnerBpFormUrl !== undefined ? (updateData.partnerBpFormUrl || null) : undefined,
          partnerBpFormKey: updateData.partnerBpFormKey !== undefined ? (updateData.partnerBpFormKey || null) : undefined,
          partnerFolderUrl: updateData.partnerFolderUrl !== undefined ? (updateData.partnerFolderUrl || null) : undefined,
          ...(partnerCustomDataPatch ? {
            partnerCustomData: {
              ...((current.partnerCustomData as Record<string, unknown>) ?? {}),
              ...partnerCustomDataPatch,
            } as unknown as import('@prisma/client').Prisma.InputJsonValue,
          } : {}),
          version: { increment: 1 },
          updatedBy: user.id,
        },
        include: {
          industry: { select: { id: true, industryName: true } },
          parent: { select: { id: true, partnerCode: true, partnerName: true } },
          contacts: CONTACT_INCLUDE,
          businessLinks: {
            where: { linkStatus: 'active' },
            select: {
              businessId: true,
              businessTier: true,
              businessTierNumber: true,
              linkCustomData: true,
            },
          },
        },
      });

      // 親変更時は子孫の tierNumber も再計算
      if (tierChanged || parentChanged) {
        await recalculateDescendantTierNumbers(tx, partnerId);
      }

      // linkCustomData の更新（トランザクション内）
      if (linkCustomDataPatch && linkBusinessId) {
        const existingLink = await tx.partnerBusinessLink.findUnique({
          where: { partnerId_businessId: { partnerId, businessId: linkBusinessId } },
        });
        if (existingLink) {
          const existingData = (existingLink.linkCustomData as Record<string, unknown>) ?? {};
          await tx.partnerBusinessLink.update({
            where: { id: existingLink.id },
            data: {
              linkCustomData: { ...existingData, ...linkCustomDataPatch } as unknown as import('@prisma/client').Prisma.InputJsonValue,
            },
          });
          // 更新後の linkCustomData を反映するため businessLinks を再取得
          const freshLinks = await tx.partnerBusinessLink.findMany({
            where: { partnerId, linkStatus: 'active' },
            select: { businessId: true, businessTier: true, businessTierNumber: true, linkCustomData: true },
          });
          (result as Record<string, unknown>).businessLinks = freshLinks;
        }
      }

      return result;
    });

    // レスポンス用の businessId: body または クエリパラメータから取得（通常PATCH時もフラット展開に必要）
    const { searchParams } = request.nextUrl;
    const responseBizId = linkBusinessId ?? (searchParams.get('businessId') ? parseInt(searchParams.get('businessId')!, 10) : undefined);
    return NextResponse.json({ success: true, data: formatPartner(updated, responseBizId) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/partners/:id  (論理削除)
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) throw ApiError.unauthorized('セッションが無効です。再ログインしてください。');

    const { id } = await params;
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    const current = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { partnerIsActive: true, partnerBpFormKey: true },
    });
    if (!current || !current.partnerIsActive) throw ApiError.notFound('代理店が見つかりません');

    await prisma.partner.update({
      where: { id: partnerId },
      data: {
        partnerIsActive: false,
        version: { increment: 1 },
        updatedBy: user.id,
      },
    });

    // BP申込書ファイルをストレージから削除
    if (current.partnerBpFormKey) {
      const storage = getStorageAdapter();
      await storage.delete(current.partnerBpFormKey).catch(() => {
        // ストレージ削除失敗はログのみ（論理削除は完了済み）
        logger.error(`storage delete failed: ${current.partnerBpFormKey}`, undefined, 'partner delete');
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
