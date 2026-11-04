import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
// 作成・更新ロジックは画面と ML連携
// （/api/integrations/customers/[customer_code]/contacts）で共有する。
// 主担当を1人までに保つ排他制御を2箇所に書かないため。
import {
  CONTACT_INCLUDE,
  createCustomerContact,
  formatContact,
} from '@/lib/customer-contact-update';
import { userActor } from '@/lib/update-actor';

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
    requireInternalUser(session);

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
      include: CONTACT_INCLUDE,
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
    requireInternalUser(session);

    const user = session.user as { id: number; role: string; userName?: string | null };
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
    const contact = await createCustomerContact(prisma, customerId, body, userActor(user));

    return NextResponse.json({ success: true, data: formatContact(contact) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
