import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
import {
  getRewardConfig,
  getRewardEntriesForPeriod,
  computeStatementTotals,
  generateStatementNo,
} from '@/lib/reward-helpers';
import type { RewardStatementListItem } from '@/types/reward';

// ============================================
// GET /api/v1/rewards/statements?businessId=&partnerId=&periodMonth=
// ============================================
// 確定済み明細書の一覧（businessId 必須、partnerId・periodMonth は任意の絞り込み）。

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    requireInternalUser(session);

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    if (!businessIdParam) throw ApiError.badRequest('事業IDが必要です');
    const businessId = parseInt(businessIdParam, 10);
    if (isNaN(businessId)) throw ApiError.badRequest('不正な事業IDです');

    const partnerIdParam = searchParams.get('partnerId');
    const periodMonth = searchParams.get('periodMonth');

    const where: Record<string, unknown> = { businessId };
    if (partnerIdParam) {
      const partnerId = parseInt(partnerIdParam, 10);
      if (isNaN(partnerId)) throw ApiError.badRequest('不正な代理店IDです');
      where.partnerId = partnerId;
    }
    if (periodMonth) where.periodMonth = periodMonth;

    const statements = await prisma.rewardStatement.findMany({
      where,
      orderBy: [{ periodMonth: 'desc' }, { partnerId: 'asc' }],
      include: {
        partner: { select: { partnerName: true, partnerCode: true } },
        confirmer: { select: { userName: true } },
      },
    });

    const items: RewardStatementListItem[] = statements.map((s) => ({
      id: s.id,
      businessId: s.businessId,
      partnerId: s.partnerId,
      partnerName: s.partner.partnerName,
      partnerCode: s.partner.partnerCode,
      periodMonth: s.periodMonth,
      status: s.status,
      statementNo: s.statementNo,
      totalDirect: s.totalDirect.toNumber(),
      totalIndirect: s.totalIndirect.toNumber(),
      subtotal: s.subtotal.toNumber(),
      taxAmount: s.taxAmount.toNumber(),
      grandTotal: s.grandTotal.toNumber(),
      confirmedAt: s.confirmedAt?.toISOString() ?? null,
      confirmedByName: s.confirmer?.userName ?? null,
    }));

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/rewards/statements
// ============================================
// 期間（事業×代理店×対象月）の報酬をライブ再計算し、締め（確定）として
// RewardStatement + RewardEntry に不変スナップショットを固定する。
//
// 会計クリティカル:
// - 計算はライブ再計算（getRewardEntriesForPeriod）が唯一の真実の源。再実装しない
// - 明細書と全明細行を単一トランザクションで原子的に作成（部分作成を許さない）
// - 二重確定/同時確定は @@unique([businessId, partnerId, periodMonth]) 違反(P2002)を
//   409 に変換。上書き・重複作成・500 は起こさない
// - 確定は不可逆（ロールバック/調整機能は将来対応・スコープ外）

const bodySchema = z.object({
  businessId: z.number().int().positive(),
  partnerId: z.number().int().positive(),
  periodMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodMonth は YYYY-MM 形式で指定してください'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    const user = requireInternalUser(session);

    const json = await request.json();
    const { businessId, partnerId, periodMonth } = bodySchema.parse(json);

    // 事業・代理店の存在確認と採番用コードの取得
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessCode: true, businessConfig: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, partnerCode: true },
    });
    if (!partner) throw ApiError.notFound('代理店が見つかりません');

    const config = getRewardConfig(business.businessConfig);
    if (!config) throw ApiError.badRequest('この事業には報酬設定がありません');

    // ライブ再計算（唯一の真実の源）→ 対象代理店ぶんに絞る。
    // 明細ゼロ（¥0）でも確定は許可する（正式な¥0明細書が必要なケースがある）。
    const allEntries = await getRewardEntriesForPeriod(prisma, businessId, periodMonth, periodMonth);
    const entries = allEntries.filter((e) => e.partnerId === partnerId);

    const totals = computeStatementTotals(entries, config.taxRate);
    const statementNo = generateStatementNo(business.businessCode, periodMonth, partner.partnerCode);
    const now = new Date();

    // 明細書＋明細行を1トランザクションで原子的に確定
    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        return tx.rewardStatement.create({
          data: {
            businessId,
            partnerId,
            periodMonth,
            status: 'confirmed',
            statementNo,
            totalDirect: totals.totalDirect,
            totalIndirect: totals.totalIndirect,
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            grandTotal: totals.grandTotal,
            confirmedAt: now,
            confirmedBy: user.id,
            entries: {
              create: entries.map((e) => ({
                projectId: e.projectId,
                rewardKind: e.rewardKind,
                entryType: e.entryType,
                sourceMonth: e.sourceMonth,
                sourcePartnerId: e.sourcePartnerId,
                projectNoSnapshot: e.projectNo,
                customerNameSnapshot: e.customerName,
                baseAmount: e.baseAmount,
                rewardType: e.rewardType,
                rate: e.rate,
                rewardAmount: e.rewardAmount,
              })),
            },
          },
          include: { entries: true },
        });
      });
    } catch (err) {
      // 同時確定・二重確定: unique 制約違反は「確定済み」の 409 として返す
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw ApiError.conflict('この期間の明細は既に確定済みです');
      }
      throw err;
    }

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
