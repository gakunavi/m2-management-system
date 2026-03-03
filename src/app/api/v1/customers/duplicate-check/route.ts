import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const name = searchParams.get('name')?.trim();
    const phone = searchParams.get('phone')?.trim();
    const excludeId = searchParams.get('excludeId');

    if (!name || name.length < 2) {
      return NextResponse.json({ success: true, data: { matches: [], isExactComboMatch: false } });
    }

    // 名前の部分一致で候補を検索
    const where: Record<string, unknown> = {
      customerIsActive: true,
      customerName: { contains: name, mode: 'insensitive' },
    };

    if (excludeId) {
      where.id = { not: parseInt(excludeId, 10) };
    }

    // 電話番号が指定されている場合は完全一致でフィルタ
    if (phone) {
      where.customerPhone = phone;
    }

    const matches = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        customerPhone: true,
      },
      take: 5,
    });

    // 完全一致判定: 名前の完全一致 + 電話番号の完全一致
    const isExactComboMatch = phone
      ? matches.some(
          (m) => m.customerName === name && m.customerPhone === phone,
        )
      : false;

    return NextResponse.json({
      success: true,
      data: {
        matches: matches.map((m) => ({
          id: m.id,
          code: m.customerCode,
          name: m.customerName,
          phone: m.customerPhone,
        })),
        isExactComboMatch,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
