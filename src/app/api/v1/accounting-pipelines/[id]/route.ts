import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/error-handler';
import { formatAccountingPipeline } from '@/lib/format-accounting-pipeline';

const PIPELINE_INCLUDE = {
  project: {
    select: {
      id: true,
      projectNo: true,
      projectSalesStatus: true,
      customer: { select: { id: true, customerName: true } },
      partner: { select: { id: true, partnerName: true } },
    },
  },
  business: { select: { id: true, businessName: true } },
  entries: {
    orderBy: { entryDate: 'desc' as const },
    include: {
      distributions: {
        orderBy: { tier: 'asc' as const },
        include: {
          partner: { select: { id: true, partnerCode: true, partnerName: true } },
        },
      },
    },
  },
} as const;

// GET: パイプライン詳細
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const pipelineId = parseInt(id, 10);
    if (isNaN(pipelineId)) throw ApiError.badRequest('無効なIDです');

    const pipeline = await prisma.accountingPipeline.findFirst({
      where: { id: pipelineId, pipelineIsActive: true },
      include: PIPELINE_INCLUDE,
    });
    if (!pipeline) throw ApiError.notFound('パイプラインが見つかりません');

    return NextResponse.json({ success: true, data: formatAccountingPipeline(pipeline) });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH: パイプライン更新
const updatePipelineSchema = z.object({
  revenueType: z.enum(['SHOT', 'STOCK']).optional(),
  unitPrice: z.number().positive().optional(),
  quantity: z.number().int().min(1).optional(),
  billingCycle: z.string().max(50).nullable().optional(),
  paymentMethod: z.string().max(100).nullable().optional(),
  operationStartDate: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  pipelineIsActive: z.boolean().optional(),
  version: z.number().int(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const pipelineId = parseInt(id, 10);
    if (isNaN(pipelineId)) throw ApiError.badRequest('無効なIDです');

    const body = await request.json();
    const data = updatePipelineSchema.parse(body);

    const current = await prisma.accountingPipeline.findFirst({
      where: { id: pipelineId },
    });
    if (!current) throw ApiError.notFound('パイプラインが見つかりません');
    if (current.version !== data.version) {
      throw ApiError.conflict('他のユーザーによって更新されています。画面を更新してください。');
    }

    const unitPrice = data.unitPrice ?? Number(current.unitPrice);
    const quantity = data.quantity ?? current.quantity;
    const totalAmount = unitPrice * quantity;

    const updated = await prisma.accountingPipeline.update({
      where: { id: pipelineId },
      data: {
        ...(data.revenueType !== undefined ? { revenueType: data.revenueType } : {}),
        ...(data.unitPrice !== undefined ? { unitPrice: data.unitPrice } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        totalAmount,
        ...(data.billingCycle !== undefined ? { billingCycle: data.billingCycle } : {}),
        ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod } : {}),
        ...(data.operationStartDate !== undefined
          ? { operationStartDate: data.operationStartDate ? new Date(data.operationStartDate) : null }
          : {}),
        ...(data.memo !== undefined ? { memo: data.memo } : {}),
        ...(data.pipelineIsActive !== undefined ? { pipelineIsActive: data.pipelineIsActive } : {}),
        version: { increment: 1 },
        updatedBy: user.id,
      },
      include: PIPELINE_INCLUDE,
    });

    return NextResponse.json({ success: true, data: formatAccountingPipeline(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: パイプライン論理削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const pipelineId = parseInt(id, 10);
    if (isNaN(pipelineId)) throw ApiError.badRequest('無効なIDです');

    const current = await prisma.accountingPipeline.findFirst({
      where: { id: pipelineId },
    });
    if (!current) throw ApiError.notFound('パイプラインが見つかりません');

    await prisma.accountingPipeline.update({
      where: { id: pipelineId },
      data: { pipelineIsActive: false, updatedBy: user.id, version: { increment: 1 } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
