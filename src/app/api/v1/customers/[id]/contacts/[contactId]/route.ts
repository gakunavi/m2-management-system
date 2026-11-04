import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
// 更新・削除ロジックは画面と ML連携
// （/api/integrations/customers/[customer_code]/contacts/[id]）で共有する
import {
  deleteCustomerContact,
  formatContact,
  updateCustomerContact,
} from '@/lib/customer-contact-update';
import { userActor } from '@/lib/update-actor';

// ============================================
// PATCH /api/v1/customers/:id/contacts/:contactId
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; userName?: string | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, contactId } = await params;
    const customerId = parseInt(id, 10);
    const contactIdNum = parseInt(contactId, 10);
    if (isNaN(customerId) || isNaN(contactIdNum)) throw ApiError.notFound('担当者が見つかりません');

    const body = await request.json();
    const updated = await updateCustomerContact(prisma, customerId, contactIdNum, body, userActor(user));

    return NextResponse.json({ success: true, data: formatContact(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/customers/:id/contacts/:contactId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; userName?: string | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, contactId } = await params;
    const customerId = parseInt(id, 10);
    const contactIdNum = parseInt(contactId, 10);
    if (isNaN(customerId) || isNaN(contactIdNum)) throw ApiError.notFound('担当者が見つかりません');

    await deleteCustomerContact(prisma, customerId, contactIdNum, userActor(user));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
