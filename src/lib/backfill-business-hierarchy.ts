// ============================================================================
// 事業別代理店階層のバックフィル
//
// 目的: 代理店の親子（系列）がグローバル本体（partners.parent_id）にしか入って
// おらず、事業別リンク（partner_business_links.business_parent_id）が空のために
// 代理店ポータルの傘下案件・代理店グループタブで系列が出ないデータを是正する。
//
// 方針（ユーザー確定）:
//  - 事業別リンクの business_parent_id が空のものを、グローバル parent_id から補完。
//  - ただし補完する親は「同じ事業に active リンクを持つ」場合のみ（事業の系列が
//    その事業のメンバーだけで閉じるように保つ）。親が事業外なら その事業では1次店扱い。
//  - 既に business_parent_id が入っている代理店（事業別に設定済み）は一切触らない。
//
// 適用後は business_tier / business_tier_number を、新たに親子が付いた部分木にだけ
// 既存ヘルパー（recalculateBusinessDescendantTierNumbers）でカスケード設定する。
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import { recalculateBusinessDescendantTierNumbers } from './business-partner-hierarchy';

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

type ActiveLink = {
  id: number;
  partnerId: number;
  businessId: number;
  businessTier: string | null;
  businessTierNumber: string | null;
  businessParentId: number | null;
};

type PartnerRow = {
  id: number;
  parentId: number | null;
  partnerCode: string;
  partnerName: string;
};

/** 1件の親補完アクション */
export interface ParentAssignment {
  businessId: number;
  partnerId: number;
  partnerName: string;
  newParentId: number;
  newParentName: string;
}

/** 親がその事業に在籍しないため1次店扱いにする（補完しない）ケース */
export interface ParentOutsideBusiness {
  businessId: number;
  partnerId: number;
  partnerName: string;
  globalParentId: number;
  globalParentName: string;
}

export interface BackfillPlan {
  /** business_parent_id を補完する件 */
  assignments: ParentAssignment[];
  /** グローバル親が事業外 → その事業では1次店扱い（変更なし・可視化のため報告） */
  parentOutsideBusiness: ParentOutsideBusiness[];
  /** 事業別に既に親が設定済みで対象外だった件数 */
  alreadyHasBusinessParent: number;
  /** グローバル親も無い（元から1次店/単独）件数 */
  noGlobalParent: number;
  /** 対象 active リンク総数 */
  totalActiveLinks: number;
}

async function loadData(prisma: TxClient): Promise<{ links: ActiveLink[]; partners: Map<number, PartnerRow> }> {
  const links = await prisma.partnerBusinessLink.findMany({
    where: { linkStatus: 'active' },
    select: {
      id: true,
      partnerId: true,
      businessId: true,
      businessTier: true,
      businessTierNumber: true,
      businessParentId: true,
    },
  });
  const partnerRows = await prisma.partner.findMany({
    select: { id: true, parentId: true, partnerCode: true, partnerName: true },
  });
  const partners = new Map<number, PartnerRow>();
  for (const p of partnerRows) partners.set(p.id, p);
  return { links, partners };
}

/**
 * バックフィル計画を算出する（読み取り専用・DB は書き換えない）。
 */
export async function computeBackfillPlan(prisma: TxClient): Promise<BackfillPlan> {
  const { links, partners } = await loadData(prisma);

  // businessId -> その事業に active リンクを持つ partnerId 集合
  const linkedByBusiness = new Map<number, Set<number>>();
  for (const l of links) {
    let set = linkedByBusiness.get(l.businessId);
    if (!set) {
      set = new Set<number>();
      linkedByBusiness.set(l.businessId, set);
    }
    set.add(l.partnerId);
  }

  const plan: BackfillPlan = {
    assignments: [],
    parentOutsideBusiness: [],
    alreadyHasBusinessParent: 0,
    noGlobalParent: 0,
    totalActiveLinks: links.length,
  };

  for (const l of links) {
    if (l.businessParentId != null) {
      plan.alreadyHasBusinessParent += 1;
      continue;
    }
    const p = partners.get(l.partnerId);
    const gp = p?.parentId ?? null;
    if (gp == null) {
      plan.noGlobalParent += 1;
      continue;
    }
    const linkedSet = linkedByBusiness.get(l.businessId)!;
    const parentName = partners.get(gp)?.partnerName ?? `#${gp}`;
    if (linkedSet.has(gp)) {
      plan.assignments.push({
        businessId: l.businessId,
        partnerId: l.partnerId,
        partnerName: p?.partnerName ?? `#${l.partnerId}`,
        newParentId: gp,
        newParentName: parentName,
      });
    } else {
      plan.parentOutsideBusiness.push({
        businessId: l.businessId,
        partnerId: l.partnerId,
        partnerName: p?.partnerName ?? `#${l.partnerId}`,
        globalParentId: gp,
        globalParentName: parentName,
      });
    }
  }

  return plan;
}

export interface BackfillResult {
  plan: BackfillPlan;
  /** 実際に business_parent_id を設定した件数 */
  parentsAssigned: number;
  /** business_tier を新規付与した root 数 */
  rootsTiered: number;
  /** tier 再計算を実行した (businessId, rootPartnerId) */
  recalculatedRoots: Array<{ businessId: number; partnerId: number }>;
}

/**
 * バックフィルを適用する（トランザクション内で呼ぶこと）。
 * - business_parent_id を補完
 * - 新たに親子が付いた部分木の root に business_tier='1次代理店' を付与
 * - recalculateBusinessDescendantTierNumbers で配下の tier/tier_number をカスケード
 *
 * 既に business_tier が入っている代理店（既存系列）の root は触らない。
 */
export async function applyBackfill(tx: TxClient): Promise<BackfillResult> {
  const plan = await computeBackfillPlan(tx);

  // 1) business_parent_id を補完
  for (const a of plan.assignments) {
    await tx.partnerBusinessLink.updateMany({
      where: { businessId: a.businessId, partnerId: a.partnerId },
      data: { businessParentId: a.newParentId },
    });
  }

  // 2) 補完後の状態を再ロードして、部分木の root（business_parent_id が null で
  //    かつ子を持つ＝系列の頂点）のうち business_tier 未設定のものに '1次代理店' を付与。
  const { links } = await loadData(tx);
  const byBusiness = new Map<number, ActiveLink[]>();
  for (const l of links) {
    let arr = byBusiness.get(l.businessId);
    if (!arr) {
      arr = [];
      byBusiness.set(l.businessId, arr);
    }
    arr.push(l);
  }

  const recalculatedRoots: Array<{ businessId: number; partnerId: number }> = [];
  let rootsTiered = 0;

  // 今回補完で親子が付いた事業のみ対象
  const affectedBusinessIds = Array.from(new Set(plan.assignments.map((a) => a.businessId)));

  for (const businessId of affectedBusinessIds) {
    const bizLinks = byBusiness.get(businessId) ?? [];
    const linkByPartner = new Map<number, ActiveLink>();
    const childrenOf = new Map<number, number[]>();
    for (const l of bizLinks) {
      linkByPartner.set(l.partnerId, l);
      if (l.businessParentId != null) {
        const arr = childrenOf.get(l.businessParentId) ?? [];
        arr.push(l.partnerId);
        childrenOf.set(l.businessParentId, arr);
      }
    }

    // 今回補完した子の root 祖先を特定（business_parent_id を遡る）
    const rootIds = new Set<number>();
    for (const a of plan.assignments.filter((x) => x.businessId === businessId)) {
      let current = a.partnerId;
      const seen = new Set<number>([current]);
      for (let depth = 0; depth < 10; depth++) {
        const link = linkByPartner.get(current);
        const parent = link?.businessParentId ?? null;
        if (parent == null || seen.has(parent)) break;
        seen.add(parent);
        current = parent;
      }
      rootIds.add(current);
    }

    for (const rootId of Array.from(rootIds)) {
      const rootLink = linkByPartner.get(rootId);
      if (!rootLink) continue;
      // 既存系列の root（tier 設定済み）は触らない
      if (rootLink.businessTier == null) {
        const partner = await tx.partner.findUnique({
          where: { id: rootId },
          select: { partnerCode: true },
        });
        await tx.partnerBusinessLink.updateMany({
          where: { businessId, partnerId: rootId },
          data: { businessTier: '1次代理店', businessTierNumber: partner?.partnerCode ?? null },
        });
        rootsTiered += 1;
      }
      // 配下の tier ラベル・tier_number をカスケード
      await recalculateBusinessDescendantTierNumbers(tx, businessId, rootId);
      recalculatedRoots.push({ businessId, partnerId: rootId });
    }
  }

  return {
    plan,
    parentsAssigned: plan.assignments.length,
    rootsTiered,
    recalculatedRoots,
  };
}
