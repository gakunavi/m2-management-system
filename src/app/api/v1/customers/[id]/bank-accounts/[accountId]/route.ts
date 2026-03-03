import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  updateBankAccountSchema,
  formatBankAccount,
  BUSINESS_INCLUDE,
} from '@/lib/bank-account-helpers';

// ============================================
// PATCH /api/v1/customers/:id/bank-accounts/:accountId
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, accountId } = await params;
    const customerId = parseInt(id, 10);
    const accountIdNum = parseInt(accountId, 10);
    if (isNaN(customerId) || isNaN(accountIdNum)) throw ApiError.notFound('口座情報が見つかりません');

    const existing = await prisma.customerBankAccount.findFirst({
      where: { id: accountIdNum, customerId },
    });
    if (!existing) throw ApiError.notFound('口座情報が見つかりません');

    const body = await request.json();
    const data = updateBankAccountSchema.parse(body);

    const updated = await prisma.customerBankAccount.update({
      where: { id: accountIdNum },
      data,
      include: BUSINESS_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      data: formatBankAccount(updated),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/customers/:id/bank-accounts/:accountId
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, accountId } = await params;
    const customerId = parseInt(id, 10);
    const accountIdNum = parseInt(accountId, 10);
    if (isNaN(customerId) || isNaN(accountIdNum)) throw ApiError.notFound('口座情報が見つかりません');

    const existing = await prisma.customerBankAccount.findFirst({
      where: { id: accountIdNum, customerId },
    });
    if (!existing) throw ApiError.notFound('口座情報が見つかりません');

    await prisma.customerBankAccount.delete({ where: { id: accountIdNum } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
