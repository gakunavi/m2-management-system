import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { findBusinessRootPartnerId } from '@/lib/business-partner-hierarchy';

// ============================================
// GET /api/v1/partners/:id/business-group-tree?businessId=X
// 事業別階層のルート祖先から全子孫をフラット配列で返す
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    if (!businessIdParam) throw ApiError.badRequest('businessId は必須です');

    const businessId = parseInt(businessIdParam, 10);
    if (isNaN(businessId)) throw ApiError.badRequest('businessId が不正です');

    // この代理店が対象事業にリンクされているか確認
    const link = await prisma.partnerBusinessLink.findFirst({
      where: { partnerId, businessId, linkStatus: 'active' },
      select: { id: true, businessTier: true },
    });

    if (!link || !link.businessTier) {
      // 事業リンクなし or 事業別階層未設定
      return NextResponse.json({ success: true, data: [] });
    }

    // 事業内のルート祖先を取得
    const rootId = await findBusinessRootPartnerId(prisma, businessId, partnerId);

    // ルートから全子孫を BFS で収集
    const allNodes = await collectBusinessDescendants(businessId, rootId);

    return NextResponse.json({ success: true, data: allNodes });
  } catch (error) {
    return handleApiError(error);
  }
}

interface BusinessGroupTreeNode {
  id: number;
  partnerCode: string;
  partnerName: string;
  partnerTier: string | null;
  partnerTierNumber: string | null;
  parentId: number | null;
  partnerIsActive: boolean;
}

async function collectBusinessDescendants(
  businessId: number,
  rootPartnerId: number,
): Promise<BusinessGroupTreeNode[]> {
  const result: BusinessGroupTreeNode[] = [];
  const queue: number[] = [rootPartnerId];
  const visited = new Set<number>();

  // BFS で事業内の全子孫を収集（最大100件で安全策）
  while (queue.length > 0 && result.length < 100) {
    const currentPartnerId = queue.shift()!;
    if (visited.has(currentPartnerId)) continue;
    visited.add(currentPartnerId);

    // 代理店の基本情報を取得
    const partner = await prisma.partner.findUnique({
      where: { id: currentPartnerId },
      select: {
        id: true,
        partnerCode: true,
        partnerName: true,
        partnerIsActive: true,
      },
    });

    if (!partner) continue;

    // 事業別のリンク情報を取得
    const bizLink = await prisma.partnerBusinessLink.findFirst({
      where: { businessId, partnerId: currentPartnerId, linkStatus: 'active' },
      select: {
        businessTier: true,
        businessTierNumber: true,
        businessParentId: true,
      },
    });

    result.push({
      id: partner.id,
      partnerCode: partner.partnerCode,
      partnerName: partner.partnerName,
      partnerTier: bizLink?.businessTier ?? null,
      partnerTierNumber: bizLink?.businessTierNumber ?? null,
      parentId: bizLink?.businessParentId ?? null,
      partnerIsActive: partner.partnerIsActive,
    });

    // 事業内でこの代理店を親とするリンクを検索
    const children = await prisma.partnerBusinessLink.findMany({
      where: {
        businessId,
        businessParentId: currentPartnerId,
        linkStatus: 'active',
      },
      orderBy: { businessTierNumber: 'asc' },
      select: { partnerId: true },
    });

    queue.push(...children.map((c) => c.partnerId));
  }

  return result;
}
