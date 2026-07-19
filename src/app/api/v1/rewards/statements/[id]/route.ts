import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
import type { RewardStatementDetail } from '@/types/reward';

// ============================================
// GET /api/v1/rewards/statements/:id
// ============================================
// 確定済み明細書1件の詳細（明細行を含む、締め時点のスナップショット）。

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    requireInternalUser(session);

    const { id } = await params;
    const statementId = parseInt(id, 10);
    if (isNaN(statementId)) throw ApiError.badRequest('不正なIDです');

    const statement = await prisma.rewardStatement.findUnique({
      where: { id: statementId },
      include: {
        business: { select: { businessName: true } },
        partner: { select: { partnerName: true, partnerCode: true } },
        confirmer: { select: { userName: true } },
        entries: {
          orderBy: [{ projectNoSnapshot: 'asc' }, { id: 'asc' }],
          include: { sourcePartner: { select: { partnerName: true } } },
        },
      },
    });
    if (!statement) throw ApiError.notFound('明細書が見つかりません');

    const response: RewardStatementDetail = {
      id: statement.id,
      businessId: statement.businessId,
      businessName: statement.business.businessName,
      partnerId: statement.partnerId,
      partnerName: statement.partner.partnerName,
      partnerCode: statement.partner.partnerCode,
      periodMonth: statement.periodMonth,
      status: statement.status,
      statementNo: statement.statementNo,
      totalDirect: statement.totalDirect.toNumber(),
      totalIndirect: statement.totalIndirect.toNumber(),
      subtotal: statement.subtotal.toNumber(),
      taxAmount: statement.taxAmount.toNumber(),
      grandTotal: statement.grandTotal.toNumber(),
      confirmedAt: statement.confirmedAt?.toISOString() ?? null,
      confirmedByName: statement.confirmer?.userName ?? null,
      entries: statement.entries.map((e) => ({
        id: e.id,
        projectId: e.projectId,
        projectNoSnapshot: e.projectNoSnapshot,
        customerNameSnapshot: e.customerNameSnapshot,
        rewardKind: e.rewardKind as 'shot' | 'stock',
        entryType: e.entryType as 'direct' | 'indirect',
        sourcePartnerId: e.sourcePartnerId,
        sourcePartnerName: e.sourcePartner?.partnerName ?? null,
        sourceMonth: e.sourceMonth,
        baseAmount: e.baseAmount.toNumber(),
        rewardType: e.rewardType as 'rate' | 'fixed',
        rate: e.rate ? e.rate.toNumber() : null,
        rewardAmount: e.rewardAmount.toNumber(),
      })),
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return handleApiError(error);
  }
}
