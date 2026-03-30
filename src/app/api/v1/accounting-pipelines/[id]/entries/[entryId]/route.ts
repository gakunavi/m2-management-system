import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/error-handler';

// PATCH: エントリ更新
const updateEntrySchema = z.object({
  entryDate: z.string().optional(),
  amount: z.number().positive().optional(),
  periodYear: z.number().int().min(2000).max(2100).optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
  entryMemo: z.string().nullable().optional(),
  entryStatus: z.enum(['DRAFT', 'CONFIRMED']).optional(),
  version: z.number().int(),
});

export async function PATCH(
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
    const data = updateEntrySchema.parse(body);

    const current = await prisma.pipelineEntry.findFirst({
      where: { id: entryIdNum, pipelineId },
    });
    if (!current) throw ApiError.notFound('エントリが見つかりません');
    if (current.version !== data.version) {
      throw ApiError.conflict('他のユーザーによって更新されています。画面を更新してください。');
    }
    if (current.entryStatus === 'CONFIRMED' && data.entryStatus !== 'DRAFT') {
      // 確定済みのエントリは編集不可（DRAFTへの差し戻しのみ可）
      if (data.entryDate || data.amount || data.periodYear || data.periodMonth) {
        throw ApiError.badRequest('確定済みのエントリは編集できません。DRAFTに戻してから編集してください。');
      }
    }

    const updated = await prisma.pipelineEntry.update({
      where: { id: entryIdNum },
      data: {
        ...(data.entryDate !== undefined ? { entryDate: new Date(data.entryDate) } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.periodYear !== undefined ? { periodYear: data.periodYear } : {}),
        ...(data.periodMonth !== undefined ? { periodMonth: data.periodMonth } : {}),
        ...(data.entryMemo !== undefined ? { entryMemo: data.entryMemo } : {}),
        ...(data.entryStatus !== undefined ? { entryStatus: data.entryStatus } : {}),
        version: { increment: 1 },
        updatedBy: user.id,
      },
      include: {
        distributions: {
          orderBy: { tier: 'asc' },
          include: {
            partner: { select: { id: true, partnerCode: true, partnerName: true } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        pipelineId: updated.pipelineId,
        entryDate: updated.entryDate.toISOString().split('T')[0],
        amount: Number(updated.amount),
        periodYear: updated.periodYear,
        periodMonth: updated.periodMonth,
        entryStatus: updated.entryStatus,
        entryMemo: updated.entryMemo,
        version: updated.version,
        distributions: updated.distributions.map((d) => ({
          id: d.id,
          partnerId: d.partnerId,
          partnerName: d.partner?.partnerName ?? null,
          tier: d.tier,
          tierLabel: d.tierLabel,
          rateType: d.rateType,
          commissionRate: Number(d.commissionRate),
          commissionAmount: Number(d.commissionAmount),
          isManualOverride: d.isManualOverride,
          paymentStatus: d.paymentStatus,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: エントリ削除
export async function DELETE(
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

    const current = await prisma.pipelineEntry.findFirst({
      where: { id: entryIdNum, pipelineId },
    });
    if (!current) throw ApiError.notFound('エントリが見つかりません');
    if (current.entryStatus === 'CONFIRMED') {
      throw ApiError.badRequest('確定済みのエントリは削除できません');
    }

    // CASCADE で distributions も削除される
    await prisma.pipelineEntry.delete({ where: { id: entryIdNum } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
