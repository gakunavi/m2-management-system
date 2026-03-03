import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// GET /api/v1/customers/filter-options
// ============================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const [industries, businesses] = await Promise.all([
      prisma.industry.findMany({
        where: { isActive: true },
        select: { id: true, industryName: true },
        orderBy: [{ displayOrder: 'asc' }, { industryName: 'asc' }],
      }),
      prisma.business.findMany({
        where: { businessIsActive: true },
        select: { id: true, businessName: true, businessCode: true },
        orderBy: { businessSortOrder: 'asc' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        industryId: industries.map((i) => ({
          value: String(i.id),
          label: i.industryName,
        })),
        customerType: [
          { value: '法人', label: '法人' },
          { value: '個人事業主', label: '個人事業主' },
          { value: '個人', label: '個人' },
          { value: '確認中', label: '確認中' },
          { value: '未設定', label: '未設定' },
        ],
        businesses: businesses.map((b) => ({
          value: String(b.id),
          label: b.businessName,
          businessCode: b.businessCode,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
