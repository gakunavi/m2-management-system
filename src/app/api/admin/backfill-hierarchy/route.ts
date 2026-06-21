import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeBackfillPlan, applyBackfill } from '@/lib/backfill-business-hierarchy';

export const dynamic = 'force-dynamic';

// ============================================================================
// 一時運用エンドポイント（事業別代理店階層のバックフィル）
//
// グローバル親(partners.parent_id)にしか系列が無い代理店の business_parent_id 等を
// 補完するための、一回限りの運用用。確認後にこのファイルごと削除する。
//
// 認証: Authorization: Bearer <STATS_API_TOKEN>（既存の機械アクセス用トークンを流用）
//   - GET                     → dry-run（読み取り専用・計画を返す）
//   - POST {"confirm":"APPLY-BACKFILL"} → 適用（トランザクション）＋ 変更前スナップショット返却
// ============================================================================

function authOk(request: NextRequest): { ok: boolean; status?: number } {
  const token = process.env.STATS_API_TOKEN;
  if (!token) return { ok: false, status: 404 };
  if (request.headers.get('authorization') !== `Bearer ${token}`) return { ok: false, status: 401 };
  return { ok: true };
}

export async function GET(request: NextRequest) {
  const auth = authOk(request);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status });

  const plan = await computeBackfillPlan(prisma);
  return NextResponse.json({
    mode: 'dry-run',
    summary: {
      total_active_links: plan.totalActiveLinks,
      will_assign_parent: plan.assignments.length,
      parent_outside_business_treated_as_root: plan.parentOutsideBusiness.length,
      already_has_business_parent: plan.alreadyHasBusinessParent,
      no_global_parent: plan.noGlobalParent,
      affected_business_ids: Array.from(new Set(plan.assignments.map((a) => a.businessId))).sort((a, b) => a - b),
    },
    assignments: plan.assignments,
    parent_outside_business: plan.parentOutsideBusiness,
  });
}

export async function POST(request: NextRequest) {
  const auth = authOk(request);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status });

  let body: { confirm?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* noop */
  }
  if (body.confirm !== 'APPLY-BACKFILL') {
    return NextResponse.json(
      { error: 'confirm required', hint: 'POST body must be {"confirm":"APPLY-BACKFILL"}' },
      { status: 400 },
    );
  }

  // 影響事業の active リンクを変更前スナップショット（ロールバック用）
  const planPre = await computeBackfillPlan(prisma);
  const affectedBiz = Array.from(new Set(planPre.assignments.map((a) => a.businessId)));
  const beforeSnapshot = await prisma.partnerBusinessLink.findMany({
    where: { businessId: { in: affectedBiz }, linkStatus: 'active' },
    select: {
      id: true,
      partnerId: true,
      businessId: true,
      businessParentId: true,
      businessTier: true,
      businessTierNumber: true,
    },
  });

  const result = await prisma.$transaction(async (tx) => applyBackfill(tx), { timeout: 60000 });

  return NextResponse.json({
    mode: 'applied',
    parents_assigned: result.parentsAssigned,
    roots_tiered: result.rootsTiered,
    recalculated_roots: result.recalculatedRoots,
    parent_outside_business: result.plan.parentOutsideBusiness,
    rollback_snapshot: beforeSnapshot, // 変更前の値（business_parent_id/business_tier/business_tier_number）
  });
}
