import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/error-handler';

// GET: 分配明細一覧
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id, entryId } = await params;
    const pipelineId = parseInt(id, 10);
    const entryIdNum = parseInt(entryId, 10);
    if (isNaN(pipelineId) || isNaN(entryIdNum)) throw ApiError.badRequest('無効なIDです');

    // エントリの存在確認（パイプライン所属チェック）
    const entry = await prisma.pipelineEntry.findFirst({
      where: { id: entryIdNum, pipelineId },
    });
    if (!entry) throw ApiError.notFound('エントリが見つかりません');

    const distributions = await prisma.commissionDistribution.findMany({
      where: { entryId: entryIdNum },
      orderBy: { tier: 'asc' },
      include: {
        partner: { select: { id: true, partnerCode: true, partnerName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: distributions.map((d) => ({
        id: d.id,
        entryId: d.entryId,
        partnerId: d.partnerId,
        partnerName: d.partner?.partnerName ?? null,
        partnerCode: d.partner?.partnerCode ?? null,
        tier: d.tier,
        tierLabel: d.tierLabel,
        rateType: d.rateType,
        commissionRate: Number(d.commissionRate),
        commissionAmount: Number(d.commissionAmount),
        isManualOverride: d.isManualOverride,
        paymentDueDate: d.paymentDueDate?.toISOString().split('T')[0] ?? null,
        paymentStatus: d.paymentStatus,
        distributionMemo: d.distributionMemo,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 分配追加（手動）
const createDistributionSchema = z.object({
  partnerId: z.number().int().positive().nullable(),
  tier: z.number().int().min(1),
  tierLabel: z.string().max(100).nullable().optional(),
  rateType: z.enum(['DIRECT', 'INDIRECT']),
  commissionRate: z.number().min(0).max(100),
  paymentDueDate: z.string().nullable().optional(),
  distributionMemo: z.string().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, entryId } = await params;
    const pipelineId = parseInt(id, 10);
    const entryIdNum = parseInt(entryId, 10);
    if (isNaN(pipelineId) || isNaN(entryIdNum)) throw ApiError.badRequest('無効なIDです');

    const body = await request.json();
    const data = createDistributionSchema.parse(body);

    const entry = await prisma.pipelineEntry.findFirst({
      where: { id: entryIdNum, pipelineId },
    });
    if (!entry) throw ApiError.notFound('エントリが見つかりません');
    if (entry.entryStatus === 'CONFIRMED') {
      throw ApiError.badRequest('確定済みのエントリには分配を追加できません');
    }

    const commissionAmount = Math.floor(Number(entry.amount) * data.commissionRate / 100);

    const distribution = await prisma.commissionDistribution.create({
      data: {
        entryId: entryIdNum,
        partnerId: data.partnerId,
        tier: data.tier,
        tierLabel: data.tierLabel ?? null,
        rateType: data.rateType,
        commissionRate: data.commissionRate,
        commissionAmount,
        isManualOverride: true,
        paymentDueDate: data.paymentDueDate ? new Date(data.paymentDueDate) : null,
        distributionMemo: data.distributionMemo ?? null,
      },
      include: {
        partner: { select: { id: true, partnerCode: true, partnerName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: distribution.id,
        entryId: distribution.entryId,
        partnerId: distribution.partnerId,
        partnerName: distribution.partner?.partnerName ?? null,
        tier: distribution.tier,
        tierLabel: distribution.tierLabel,
        rateType: distribution.rateType,
        commissionRate: Number(distribution.commissionRate),
        commissionAmount: Number(distribution.commissionAmount),
        isManualOverride: distribution.isManualOverride,
        paymentDueDate: distribution.paymentDueDate?.toISOString().split('T')[0] ?? null,
        paymentStatus: distribution.paymentStatus,
        distributionMemo: distribution.distributionMemo,
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
