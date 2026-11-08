import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatCustomer } from '@/lib/format-customer';
// 更新ロジックは画面と ML連携（/api/integrations/customers/[customer_code]）で共有する
import { applyCustomerUpdate, CUSTOMER_INCLUDE } from '@/lib/customer-update';
import { userActor } from '@/lib/update-actor';
import { notifyCustomerChangedToMl } from '@/lib/ml-scope';

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
      include: CUSTOMER_INCLUDE,
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

    const user = session.user as { id: number; role: string; userName?: string | null };
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
    const updated = await applyCustomerUpdate(prisma, {
      customerId,
      body,
      actor: userActor(user),
    });

    // レスポンス用の businessId: body または クエリパラメータから取得（通常PATCH時もフラット展開に必要）
    const { searchParams } = request.nextUrl;
    const linkBusinessId = body.businessId as number | undefined;
    const responseBizId = linkBusinessId ?? (searchParams.get('businessId') ? parseInt(searchParams.get('businessId')!, 10) : undefined);
    return NextResponse.json({ success: true, data: formatCustomer(updated, responseBizId) });
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

    // 案件の削除と同じ扱い（ML が読み直すと 404 で「消えた」と分かる）
    await notifyCustomerChangedToMl(prisma, userActor(user), {
      customerId,
      kind: 'customer',
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
