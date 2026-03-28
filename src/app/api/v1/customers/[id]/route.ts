import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatCustomer } from '@/lib/format-customer';

// ============================================
// 入力バリデーションスキーマ
// ============================================

const updateCustomerSchema = z.object({
  customerName: z.string().min(1).max(200).optional(),
  customerSalutation: z.string().max(100).optional().nullable(),
  customerType: z.enum(['法人', '個人事業主', '個人', '確認中', '未設定']).optional(),
  customerPostalCode: z.string().max(10).optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  customerPhone: z.string().max(20).optional().nullable(),
  customerFax: z.string().max(20).optional().nullable(),
  customerEmail: z.string().email().optional().nullable().or(z.literal('')),
  customerWebsite: z.string().url().optional().nullable().or(z.literal('')),
  industryId: z.coerce.number().int().positive().optional().nullable(),
  customerCorporateNumber: z.string().regex(/^\d{13}$/).optional().nullable().or(z.literal('')),
  customerInvoiceNumber: z.string().regex(/^T\d{13}$/).optional().nullable().or(z.literal('')),
  customerCapital: z.coerce.number().int().min(0).optional().nullable(),
  customerFiscalMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
  customerEstablishedDate: z.string().optional().nullable(),
  customerFolderUrl: z.string().url().optional().nullable().or(z.literal('')),
  customerNotes: z.string().optional().nullable(),
  customerIsActive: z.boolean().optional(),
  version: z.number().int().min(1),
});

// ============================================
// GET /api/v1/customers/:id
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

    const { searchParams } = _request.nextUrl;
    const bizIdParam = searchParams.get('businessId');

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        industry: { select: { id: true, industryName: true } },
        contacts: {
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
          orderBy: { contactSortOrder: 'asc' },
        },
        businessLinks: {
          where: { linkStatus: 'active' },
          select: { businessId: true, linkCustomData: true },
        },
      },
    });

    if (!customer) throw ApiError.notFound('顧客が見つかりません');

    const bizId = bizIdParam ? parseInt(bizIdParam, 10) : undefined;
    return NextResponse.json({ success: true, data: formatCustomer(customer, bizId) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/customers/:id
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

    // セッションユーザーの存在確認（seed再実行後の古いセッション対策）
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) throw ApiError.unauthorized('セッションが無効です。再ログインしてください。');

    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) throw ApiError.notFound('顧客が見つかりません');

    const body = await request.json();

    // linkCustomData / customerCustomData の更新リクエストを先に取り出す（スキーマ外）
    const linkCustomDataPatch = body.linkCustomData as Record<string, unknown> | undefined;
    const customerCustomDataPatch = body.customerCustomData as Record<string, unknown> | undefined;
    const linkBusinessId = body.businessId as number | undefined;

    const data = updateCustomerSchema.parse(body);

    // 楽観的ロック確認
    const current = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { version: true, customerIsActive: true, customerName: true, customerPhone: true, customerCustomData: true },
    });
    if (!current) throw ApiError.notFound('顧客が見つかりません');
    if (!current.customerIsActive) throw ApiError.notFound('顧客が見つかりません');
    if (current.version !== data.version) {
      throw ApiError.conflict('他のユーザーによって更新されています。画面をリロードしてください。');
    }

    // 名前+電話番号の完全一致 重複チェック（自身を除外）
    const checkName = data.customerName ?? current.customerName;
    const checkPhone = data.customerPhone !== undefined ? data.customerPhone : current.customerPhone;
    if (checkName && checkPhone) {
      const duplicate = await prisma.customer.findFirst({
        where: {
          id: { not: customerId },
          customerIsActive: true,
          customerName: checkName,
          customerPhone: checkPhone,
        },
        select: { id: true, customerCode: true, customerName: true },
      });
      if (duplicate) {
        throw ApiError.conflict(
          `同名+同電話番号の顧客が既に存在します（${duplicate.customerCode}: ${duplicate.customerName}）`,
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { version: _version, ...updateData } = data;

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...updateData,
        customerCapital:
          updateData.customerCapital != null ? BigInt(updateData.customerCapital) : updateData.customerCapital,
        customerEstablishedDate:
          updateData.customerEstablishedDate ? new Date(updateData.customerEstablishedDate) : updateData.customerEstablishedDate,
        customerEmail: updateData.customerEmail !== undefined ? (updateData.customerEmail || null) : undefined,
        customerWebsite: updateData.customerWebsite !== undefined ? (updateData.customerWebsite || null) : undefined,
        customerCorporateNumber: updateData.customerCorporateNumber !== undefined ? (updateData.customerCorporateNumber || null) : undefined,
        customerInvoiceNumber: updateData.customerInvoiceNumber !== undefined ? (updateData.customerInvoiceNumber || null) : undefined,
        customerFolderUrl: updateData.customerFolderUrl !== undefined ? (updateData.customerFolderUrl || null) : undefined,
        ...(customerCustomDataPatch ? {
          customerCustomData: {
            ...((current.customerCustomData as Record<string, unknown>) ?? {}),
            ...customerCustomDataPatch,
          } as unknown as import('@prisma/client').Prisma.InputJsonValue,
        } : {}),
        version: { increment: 1 },
        updatedBy: user.id,
      },
      include: {
        industry: { select: { id: true, industryName: true } },
        contacts: {
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
          orderBy: { contactSortOrder: 'asc' },
        },
        businessLinks: {
          where: { linkStatus: 'active' },
          select: { businessId: true, linkCustomData: true },
        },
      },
    });

    // linkCustomData の更新（事業指定時のみ）
    if (linkCustomDataPatch && linkBusinessId) {
      const existingLink = await prisma.customerBusinessLink.findUnique({
        where: { customerId_businessId: { customerId, businessId: linkBusinessId } },
      });
      if (existingLink) {
        const existingData = (existingLink.linkCustomData as Record<string, unknown>) ?? {};
        await prisma.customerBusinessLink.update({
          where: { id: existingLink.id },
          data: {
            linkCustomData: { ...existingData, ...linkCustomDataPatch } as unknown as import('@prisma/client').Prisma.InputJsonValue,
          },
        });
      }
    }

    const bizId = linkBusinessId;
    return NextResponse.json({ success: true, data: formatCustomer(updated, bizId) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/customers/:id  (論理削除)
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

    // セッションユーザーの存在確認
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) throw ApiError.unauthorized('セッションが無効です。再ログインしてください。');

    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) throw ApiError.notFound('顧客が見つかりません');

    const current = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { customerIsActive: true },
    });
    if (!current || !current.customerIsActive) throw ApiError.notFound('顧客が見つかりません');

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        customerIsActive: false,
        version: { increment: 1 },
        updatedBy: user.id,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
