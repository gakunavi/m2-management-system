import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const createContactSchema = z.object({
  contactName: z.string().min(1, '担当者名は必須です').max(100),
  contactDepartment: z.string().max(100).optional().nullable(),
  contactPosition: z.string().max(100).optional().nullable(),
  contactIsRepresentative: z.boolean().default(false),
  contactPhone: z.string().max(20).optional().nullable(),
  contactFax: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  contactBusinessCardFrontUrl: z.string().max(500).optional().nullable().or(z.literal('')),
  contactBusinessCardBackUrl: z.string().max(500).optional().nullable().or(z.literal('')),
  contactIsPrimary: z.boolean().default(false),
  contactSortOrder: z.number().int().min(0).default(0),
  businessIds: z.array(z.number().int().positive()).default([]),
});

// ============================================
// レスポンス整形
// ============================================

function formatContact(c: {
  id: number;
  customerId: number;
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
// GET /api/v1/customers/:id/contacts
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) throw ApiError.notFound('顧客が見つかりません');

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw ApiError.notFound('顧客が見つかりません');

    const contacts = await prisma.customerContact.findMany({
      where: { customerId },
      orderBy: [{ contactSortOrder: 'asc' }, { id: 'asc' }],
      include: {
        businessLinks: {
          include: {
            business: {
              select: { id: true, businessName: true, businessCode: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: contacts.map(formatContact),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/customers/:id/contacts
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
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) throw ApiError.notFound('顧客が見つかりません');

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw ApiError.notFound('顧客が見つかりません');

    const body = await request.json();
    const data = createContactSchema.parse(body);

    const contact = await prisma.$transaction(async (tx) => {
      // 主担当の排他制御: 新規が主担当の場合、既存の主担当を解除
      if (data.contactIsPrimary) {
        await tx.customerContact.updateMany({
          where: { customerId, contactIsPrimary: true },
          data: { contactIsPrimary: false },
        });
      }

      const newContact = await tx.customerContact.create({
        data: {
          customerId,
          contactName: data.contactName,
          contactDepartment: data.contactDepartment ?? null,
          contactPosition: data.contactPosition ?? null,
          contactIsRepresentative: data.contactIsRepresentative,
          contactPhone: data.contactPhone ?? null,
          contactFax: data.contactFax ?? null,
          contactEmail: data.contactEmail || null,
          contactBusinessCardFrontUrl: data.contactBusinessCardFrontUrl || null,
          contactBusinessCardBackUrl: data.contactBusinessCardBackUrl || null,
          contactIsPrimary: data.contactIsPrimary,
          contactSortOrder: data.contactSortOrder,
        },
      });

      // 事業リンク作成
      if (data.businessIds.length > 0) {
        await tx.customerContactBusinessLink.createMany({
          data: data.businessIds.map((businessId) => ({
            contactId: newContact.id,
            businessId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.customerContact.findUnique({
        where: { id: newContact.id },
        include: {
          businessLinks: {
            include: {
              business: { select: { id: true, businessName: true, businessCode: true } },
            },
          },
        },
      });
    });

    if (!contact) throw new Error('担当者の作成に失敗しました');

    return NextResponse.json({ success: true, data: formatContact(contact) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
