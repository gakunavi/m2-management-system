import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { clearBusinessHierarchyDescendants } from '@/lib/business-partner-hierarchy';

// ============================================
// POST /api/v1/partners/:id/business-links/toggle
// 一覧インライン編集用トグル
// ============================================

const toggleSchema = z.object({
  businessId: z.number().int().positive(),
  linked: z.boolean(),
});

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
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) throw ApiError.notFound('代理店が見つかりません');

    const body = await request.json();
    const data = toggleSchema.parse(body);

    // 事業存在確認
    const business = await prisma.business.findUnique({
      where: { id: data.businessId },
      select: { id: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    if (data.linked) {
      // リンク作成（既存なら何もしない）
      await prisma.partnerBusinessLink.upsert({
        where: {
          partnerId_businessId: { partnerId, businessId: data.businessId },
        },
        update: { linkStatus: 'active' },
        create: {
          partnerId,
          businessId: data.businessId,
          linkStatus: 'active',
        },
      });
    } else {
      // リンク削除（子孫の階層情報をクリアしてから削除）
      await prisma.$transaction(async (tx) => {
        await clearBusinessHierarchyDescendants(tx, data.businessId, partnerId);
        await tx.partnerBusinessLink.deleteMany({
          where: { partnerId, businessId: data.businessId },
        });
      });
    }

    // 更新後の全 businessLinkIds を返す
    const links = await prisma.partnerBusinessLink.findMany({
      where: { partnerId, linkStatus: 'active' },
      select: { businessId: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        businessLinkIds: links.map((l) => l.businessId),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
