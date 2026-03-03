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

    const where: Record<string, unknown> = {
      partnerIsActive: true,
      partnerName: { contains: name, mode: 'insensitive' },
    };

    if (excludeId) {
      where.id = { not: parseInt(excludeId, 10) };
    }

    if (phone) {
      where.partnerPhone = phone;
    }

    const matches = await prisma.partner.findMany({
      where,
      select: {
        id: true,
        partnerCode: true,
        partnerName: true,
        partnerPhone: true,
      },
      take: 5,
    });

    const isExactComboMatch = phone
      ? matches.some(
          (m) => m.partnerName === name && m.partnerPhone === phone,
        )
      : false;

    return NextResponse.json({
      success: true,
      data: {
        matches: matches.map((m) => ({
          id: m.id,
          code: m.partnerCode,
          name: m.partnerName,
          phone: m.partnerPhone,
        })),
        isExactComboMatch,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
