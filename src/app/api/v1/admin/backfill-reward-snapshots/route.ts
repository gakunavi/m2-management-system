import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { backfillRewardSnapshots } from '@/lib/reward-snapshot-backfill';

// ============================================
// POST /api/v1/admin/backfill-reward-snapshots
// 収益確定済み案件に手数料スナップショットを一括付与する（管理者専用・冪等）
// ============================================
//
// 凍結の仕組みを入れる前に確定した案件を守るための移行操作。実行時点の実効料率を
// そのまま焼き付けるので、実行の前後で金額は変わらない。
//
// body（いずれも任意）:
//   { "businessId": 3 }   … その事業だけ
//   { "dryRun": true }    … 件数を数えるだけ（書き込まない）

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (user.role !== 'admin') throw ApiError.forbidden();

    // body 無しでの呼び出し（curl -X POST）も許す
    const body = await request.json().catch(() => ({}));
    const businessId = typeof body?.businessId === 'number' ? body.businessId : undefined;
    const dryRun = body?.dryRun === true;

    const result = await backfillRewardSnapshots(prisma, { businessId, dryRun });

    return NextResponse.json({
      success: true,
      dryRun,
      data: result,
      message: dryRun
        ? `${result.written}件が凍結対象です（未書き込み）`
        : `${result.written}件に手数料スナップショットを付与しました`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
