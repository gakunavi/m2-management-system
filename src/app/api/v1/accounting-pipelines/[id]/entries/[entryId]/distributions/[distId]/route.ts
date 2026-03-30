import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/error-handler';

// PATCH: 分配更新
const updateDistributionSchema = z.object({
  partnerId: z.number().int().positive().nullable().optional(),
  tier: z.number().int().min(1).optional(),
  tierLabel: z.string().max(100).nullable().optional(),
  rateType: z.enum(['DIRECT', 'INDIRECT']).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  commissionAmount: z.number().min(0).optional(), // 金額直接指定も可
  paymentDueDate: z.string().nullable().optional(),
  paymentStatus: z.enum(['PENDING', 'PAID']).optional(),
  distributionMemo: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string; distId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, entryId, distId } = await params;
    const pipelineId = parseInt(id, 10);
    const entryIdNum = parseInt(entryId, 10);
    const distIdNum = parseInt(distId, 10);
    if (isNaN(pipelineId) || isNaN(entryIdNum) || isNaN(distIdNum)) {
      throw ApiError.badRequest('無効なIDです');
    }

    const body = await request.json();
    const data = updateDistributionSchema.parse(body);

    const current = await prisma.commissionDistribution.findFirst({
      where: { id: distIdNum, entryId: entryIdNum },
      include: { entry: { select: { pipelineId: true, amount: true, entryStatus: true } } },
    });
    if (!current) throw ApiError.notFound('分配が見つかりません');
    if (current.entry.pipelineId !== pipelineId) throw ApiError.notFound('分配が見つかりません');

    // 料率変更時は金額を再計算（金額直接指定がなければ）
    let commissionAmount: number | undefined;
    if (data.commissionRate !== undefined && data.commissionAmount === undefined) {
      commissionAmount = Math.floor(Number(current.entry.amount) * data.commissionRate / 100);
    } else if (data.commissionAmount !== undefined) {
      commissionAmount = data.commissionAmount;
    }

    const updated = await prisma.commissionDistribution.update({
      where: { id: distIdNum },
      data: {
        ...(data.partnerId !== undefined ? { partnerId: data.partnerId } : {}),
        ...(data.tier !== undefined ? { tier: data.tier } : {}),
        ...(data.tierLabel !== undefined ? { tierLabel: data.tierLabel } : {}),
        ...(data.rateType !== undefined ? { rateType: data.rateType } : {}),
        ...(data.commissionRate !== undefined ? { commissionRate: data.commissionRate } : {}),
        ...(commissionAmount !== undefined ? { commissionAmount } : {}),
        ...(data.paymentDueDate !== undefined
          ? { paymentDueDate: data.paymentDueDate ? new Date(data.paymentDueDate) : null }
          : {}),
        ...(data.paymentStatus !== undefined ? { paymentStatus: data.paymentStatus } : {}),
        ...(data.distributionMemo !== undefined ? { distributionMemo: data.distributionMemo } : {}),
        isManualOverride: true,
      },
      include: {
        partner: { select: { id: true, partnerCode: true, partnerName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        entryId: updated.entryId,
        partnerId: updated.partnerId,
        partnerName: updated.partner?.partnerName ?? null,
        tier: updated.tier,
        tierLabel: updated.tierLabel,
        rateType: updated.rateType,
        commissionRate: Number(updated.commissionRate),
        commissionAmount: Number(updated.commissionAmount),
        isManualOverride: updated.isManualOverride,
        paymentDueDate: updated.paymentDueDate?.toISOString().split('T')[0] ?? null,
        paymentStatus: updated.paymentStatus,
        distributionMemo: updated.distributionMemo,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 分配削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string; distId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, entryId, distId } = await params;
    const pipelineId = parseInt(id, 10);
    const entryIdNum = parseInt(entryId, 10);
    const distIdNum = parseInt(distId, 10);
    if (isNaN(pipelineId) || isNaN(entryIdNum) || isNaN(distIdNum)) {
      throw ApiError.badRequest('無効なIDです');
    }

    const current = await prisma.commissionDistribution.findFirst({
      where: { id: distIdNum, entryId: entryIdNum },
      include: { entry: { select: { pipelineId: true, entryStatus: true } } },
    });
    if (!current) throw ApiError.notFound('分配が見つかりません');
    if (current.entry.pipelineId !== pipelineId) throw ApiError.notFound('分配が見つかりません');
    if (current.entry.entryStatus === 'CONFIRMED') {
      throw ApiError.badRequest('確定済みのエントリの分配は削除できません');
    }

    await prisma.commissionDistribution.delete({ where: { id: distIdNum } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
