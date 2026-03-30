import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/error-handler';
import { calculateCommissionDistributions, buildPartnerMap } from '@/lib/commission-calculator';

// POST: 着金エントリ追加（分配自動計算）
const createEntrySchema = z.object({
  entryDate: z.string().min(1, '着金日を入力してください'),
  amount: z.number().positive('着金額は0より大きい値を入力してください'),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  entryMemo: z.string().nullable().optional(),
  // 手動分配指定（省略時は自動計算）
  distributions: z.array(z.object({
    partnerId: z.number().int().positive().nullable(),
    tier: z.number().int().min(1),
    tierLabel: z.string().max(100).nullable().optional(),
    rateType: z.enum(['DIRECT', 'INDIRECT']),
    commissionRate: z.number().min(0).max(100),
  })).optional(),
});

export async function POST(
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
    const data = createEntrySchema.parse(body);

    // パイプライン存在確認
    const pipeline = await prisma.accountingPipeline.findFirst({
      where: { id: pipelineId, pipelineIsActive: true },
      include: {
        project: {
          select: { id: true, partnerId: true, businessId: true },
        },
      },
    });
    if (!pipeline) throw ApiError.notFound('パイプラインが見つかりません');

    // 分配計算
    let distributionsToCreate: {
      partnerId: number | null;
      tier: number;
      tierLabel: string | null;
      rateType: string;
      commissionRate: number;
      commissionAmount: number;
      isManualOverride: boolean;
    }[];

    if (data.distributions && data.distributions.length > 0) {
      // 手動指定
      distributionsToCreate = data.distributions.map((d) => ({
        partnerId: d.partnerId,
        tier: d.tier,
        tierLabel: d.tierLabel ?? null,
        rateType: d.rateType,
        commissionRate: d.commissionRate,
        commissionAmount: Math.floor(data.amount * d.commissionRate / 100),
        isManualOverride: true,
      }));
    } else {
      // 自動計算: 事業内の代理店階層を取得してマップ構築
      const partners = await prisma.partner.findMany({
        where: { partnerIsActive: true },
        select: {
          id: true,
          partnerName: true,
          partnerCode: true,
          businessLinks: {
            where: { businessId: pipeline.businessId },
            select: {
              businessId: true,
              directCommissionRate: true,
              indirectCommissionRate: true,
              businessParentId: true,
            },
          },
        },
      });

      const partnerMap = buildPartnerMap(partners, pipeline.businessId);
      const calculated = calculateCommissionDistributions(
        data.amount,
        pipeline.project.partnerId,
        partnerMap
      );

      distributionsToCreate = calculated.map((d) => ({
        partnerId: d.partnerId,
        tier: d.tier,
        tierLabel: d.tierLabel,
        rateType: d.rateType,
        commissionRate: d.commissionRate,
        commissionAmount: d.commissionAmount,
        isManualOverride: false,
      }));
    }

    // トランザクション: エントリ + 分配を一括作成
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.pipelineEntry.create({
        data: {
          pipelineId,
          entryDate: new Date(data.entryDate),
          amount: data.amount,
          periodYear: data.periodYear,
          periodMonth: data.periodMonth,
          entryMemo: data.entryMemo ?? null,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      if (distributionsToCreate.length > 0) {
        await tx.commissionDistribution.createMany({
          data: distributionsToCreate.map((d) => ({
            entryId: created.id,
            partnerId: d.partnerId,
            tier: d.tier,
            tierLabel: d.tierLabel,
            rateType: d.rateType,
            commissionRate: d.commissionRate,
            commissionAmount: d.commissionAmount,
            isManualOverride: d.isManualOverride,
          })),
        });
      }

      // リレーション付きで再取得
      return tx.pipelineEntry.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          distributions: {
            orderBy: { tier: 'asc' },
            include: {
              partner: { select: { id: true, partnerCode: true, partnerName: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        id: entry.id,
        pipelineId: entry.pipelineId,
        entryDate: entry.entryDate.toISOString().split('T')[0],
        amount: Number(entry.amount),
        periodYear: entry.periodYear,
        periodMonth: entry.periodMonth,
        entryStatus: entry.entryStatus,
        entryMemo: entry.entryMemo,
        version: entry.version,
        distributions: entry.distributions.map((d) => ({
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
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
