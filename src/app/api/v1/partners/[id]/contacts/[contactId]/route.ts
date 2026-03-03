import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const updateContactSchema = z.object({
  contactName: z.string().min(1).max(100).optional(),
  contactDepartment: z.string().max(100).optional().nullable(),
  contactPosition: z.string().max(100).optional().nullable(),
  contactIsRepresentative: z.boolean().optional(),
  contactPhone: z.string().max(20).optional().nullable(),
  contactFax: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  contactBusinessCardFrontUrl: z.string().max(500).optional().nullable().or(z.literal('')),
  contactBusinessCardBackUrl: z.string().max(500).optional().nullable().or(z.literal('')),
  contactIsPrimary: z.boolean().optional(),
  contactSortOrder: z.number().int().min(0).optional(),
  businessIds: z.array(z.number().int().positive()).optional(),
});

// ============================================
// レスポンス整形
// ============================================

function formatContact(c: {
  id: number;
  partnerId: number;
  contactName: string;
  contactDepartment: string | null;
  contactPosition: string | null;
  contactIsRepresentative: boolean;
  contactPhone: string | null;
  contactFax: string | null;
  contactEmail: string | null;
  contactBusinessCardFrontUrl: string | null;
  contactBusinessCardBackUrl: string | null;
  contactIsPrimary: boolean;
  contactSortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  businessLinks: Array<{
    business: { id: number; businessName: string; businessCode: string };
  }>;
}) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    businesses: c.businessLinks.map((bl) => ({
      id: bl.business.id,
      businessId: bl.business.id,
      businessName: bl.business.businessName,
      businessCode: bl.business.businessCode,
    })),
    businessLinks: undefined,
  };
}

// ============================================
// PATCH /api/v1/partners/:id/contacts/:contactId
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, contactId } = await params;
    const partnerId = parseInt(id, 10);
    const contactIdNum = parseInt(contactId, 10);
    if (isNaN(partnerId) || isNaN(contactIdNum)) throw ApiError.notFound('担当者が見つかりません');

    const existing = await prisma.partnerContact.findFirst({
      where: { id: contactIdNum, partnerId },
    });
    if (!existing) throw ApiError.notFound('担当者が見つかりません');

    const body = await request.json();
    const data = updateContactSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      // 主担当の排他制御
      if (data.contactIsPrimary === true && !existing.contactIsPrimary) {
        await tx.partnerContact.updateMany({
          where: { partnerId, contactIsPrimary: true, id: { not: contactIdNum } },
          data: { contactIsPrimary: false },
        });
      }

      const { businessIds, ...contactData } = data;

      await tx.partnerContact.update({
        where: { id: contactIdNum },
        data: {
          ...contactData,
          contactEmail: contactData.contactEmail || null,
          contactBusinessCardFrontUrl: contactData.contactBusinessCardFrontUrl || null,
          contactBusinessCardBackUrl: contactData.contactBusinessCardBackUrl || null,
        },
      });

      // 事業リンク差し替え（指定があった場合のみ）
      if (businessIds !== undefined) {
        await tx.partnerContactBusinessLink.deleteMany({
          where: { contactId: contactIdNum },
        });
        if (businessIds.length > 0) {
          await tx.partnerContactBusinessLink.createMany({
            data: businessIds.map((bid) => ({
              contactId: contactIdNum,
              businessId: bid,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.partnerContact.findUnique({
        where: { id: contactIdNum },
        include: {
          businessLinks: {
            include: {
              business: { select: { id: true, businessName: true, businessCode: true } },
            },
          },
        },
      });
    });

    if (!updated) throw new Error('担当者の更新に失敗しました');

    return NextResponse.json({ success: true, data: formatContact(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/partners/:id/contacts/:contactId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, contactId } = await params;
    const partnerId = parseInt(id, 10);
    const contactIdNum = parseInt(contactId, 10);
    if (isNaN(partnerId) || isNaN(contactIdNum)) throw ApiError.notFound('担当者が見つかりません');

    const existing = await prisma.partnerContact.findFirst({
      where: { id: contactIdNum, partnerId },
    });
    if (!existing) throw ApiError.notFound('担当者が見つかりません');

    // onDelete: Cascade により partner_contact_business_links も自動削除される
    await prisma.partnerContact.delete({ where: { id: contactIdNum } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
