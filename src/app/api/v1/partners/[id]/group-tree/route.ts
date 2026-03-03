import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { findRootPartnerId } from '@/lib/partner-hierarchy';

// ============================================
// GET /api/v1/partners/:id/group-tree
// ルート祖先から全子孫をフラット配列で返す
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const partnerId = parseInt(id, 10);
    if (isNaN(partnerId)) throw ApiError.notFound('代理店が見つかりません');

    // ルート祖先を取得
    const rootId = await findRootPartnerId(prisma, partnerId);

    // ルートから全子孫を再帰的に取得
    const allPartners = await collectDescendants(rootId);

    return NextResponse.json({ success: true, data: allPartners });
  } catch (error) {
    return handleApiError(error);
  }
}

interface GroupTreeNode {
  id: number;
  partnerCode: string;
  partnerName: string;
  partnerTier: string | null;
  partnerTierNumber: string | null;
  parentId: number | null;
  partnerIsActive: boolean;
}

async function collectDescendants(rootId: number): Promise<GroupTreeNode[]> {
  const result: GroupTreeNode[] = [];
  const queue: number[] = [rootId];

  // BFS で全子孫を収集（最大100件で安全策）
  while (queue.length > 0 && result.length < 100) {
    const currentId = queue.shift()!;

    const partner = await prisma.partner.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        partnerCode: true,
        partnerName: true,
        partnerTier: true,
        partnerTierNumber: true,
        parentId: true,
        partnerIsActive: true,
      },
    });

    if (!partner) continue;
    result.push(partner);

    const children = await prisma.partner.findMany({
      where: { parentId: currentId },
      orderBy: { partnerTierNumber: 'asc' },
      select: { id: true },
    });

    queue.push(...children.map((c) => c.id));
  }

  return result;
}
