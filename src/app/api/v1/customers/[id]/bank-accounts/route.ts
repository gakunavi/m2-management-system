import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import {
  createBankAccountSchema,
  formatBankAccount,
  BUSINESS_INCLUDE,
} from '@/lib/bank-account-helpers';

// ============================================
// GET /api/v1/customers/:id/bank-accounts
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

    const bankAccounts = await prisma.customerBankAccount.findMany({
      where: { customerId },
      orderBy: [{ businessId: 'asc' }, { id: 'asc' }],
      include: BUSINESS_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      data: bankAccounts.map(formatBankAccount),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/customers/:id/bank-accounts
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
    const data = createBankAccountSchema.parse(body);

    // デフォルト口座の重複チェック（businessId = null の場合）
    if (data.businessId == null) {
      const existingDefault = await prisma.customerBankAccount.findFirst({
        where: { customerId, businessId: null },
      });
      if (existingDefault) {
        throw ApiError.conflict('デフォルト口座は既に登録されています。編集してください。');
      }
    } else {
      // 事業別口座の重複チェック
      const existingBusiness = await prisma.customerBankAccount.findFirst({
        where: { customerId, businessId: data.businessId },
      });
      if (existingBusiness) {
        throw ApiError.conflict('この事業の口座は既に登録されています。編集してください。');
      }
    }

    const bankAccount = await prisma.customerBankAccount.create({
      data: {
        customerId,
        businessId: data.businessId ?? null,
        bankName: data.bankName,
        branchName: data.branchName,
        accountType: data.accountType,
        accountNumber: data.accountNumber,
        accountHolder: data.accountHolder,
      },
      include: BUSINESS_INCLUDE,
    });

    return NextResponse.json({ success: true, data: formatBankAccount(bankAccount) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
