import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
import { generateRewardStatementXlsx } from '@/lib/reward-statement-xlsx';

// ============================================
// GET /api/v1/rewards/statements/:id/xlsx
// ============================================
// 確定済み明細書1件を xlsx（支払明細書テンプレート準拠）でダウンロードする。

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
        partner: { select: { partnerName: true, partnerPostalCode: true, partnerAddress: true } },
        entries: {
          orderBy: [{ projectNoSnapshot: 'asc' }, { id: 'asc' }],
          include: { sourcePartner: { select: { partnerName: true } } },
        },
      },
    });
    if (!statement) throw ApiError.notFound('明細書が見つかりません');

    const buffer = await generateRewardStatementXlsx({
      statementNo: statement.statementNo,
      partnerName: statement.partner.partnerName,
      partnerPostalCode: statement.partner.partnerPostalCode,
      partnerAddress: statement.partner.partnerAddress,
      periodMonth: statement.periodMonth,
      subtotal: statement.subtotal.toNumber(),
      taxAmount: statement.taxAmount.toNumber(),
      grandTotal: statement.grandTotal.toNumber(),
      entries: statement.entries.map((e) => ({
        projectNoSnapshot: e.projectNoSnapshot,
        customerNameSnapshot: e.customerNameSnapshot,
        rewardKind: e.rewardKind as 'shot' | 'stock',
        entryType: e.entryType as 'direct' | 'indirect',
        sourcePartnerName: e.sourcePartner?.partnerName ?? null,
        rewardAmount: e.rewardAmount.toNumber(),
      })),
    });

    const filename = `${statement.statementNo ?? `statement-${statement.id}`}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
