import type { Prisma } from '@prisma/client';

/**
 * 手数料分配の自動計算ロジック
 *
 * 判定ルール:
 * 1. 案件紹介代理店（Project.partnerId）の直料率を確認
 * 2. 直料率 > 0 → その代理店に直料率を適用
 * 3. 直料率 = 0 → 上位階層を辿り、直料率 > 0 の最初の代理店に直料率を適用（繰り上げ）
 * 4. 直料率適用代理店より上位 → 各代理店の間接料率を適用
 * 5. 料率 = 0 の代理店はスキップ（振込なし）
 * 6. 自社取り分 = 元請手数料率の分 − 全代理店分配合計
 *
 * 元請手数料率（commissionBaseRate）:
 * - 紹介代理店の PartnerBusinessLink.commissionRate から取得
 * - メーカーモデル: 100%（売上全額が自社）
 * - 代理店モデル: 例 20%（メーカーから受け取る率）
 * - 代理店ごとに異なる場合がある
 */

interface PartnerWithLink {
  id: number;
  partnerName: string;
  partnerCode: string;
  businessLink: {
    commissionRate: Prisma.Decimal | null; // 元請手数料率
    directCommissionRate: Prisma.Decimal | null;
    indirectCommissionRate: Prisma.Decimal | null;
    businessParentId: number | null;
  } | null;
}

interface DistributionInput {
  partnerId: number | null; // null = 自社
  tier: number;
  tierLabel: string;
  rateType: 'DIRECT' | 'INDIRECT';
  commissionRate: number; // %
  commissionAmount: number; // 円
}

/**
 * 代理店の階層構造を上位に辿って取得する
 */
function getPartnerChain(
  startPartnerId: number,
  partnerMap: Map<number, PartnerWithLink>
): PartnerWithLink[] {
  const chain: PartnerWithLink[] = [];
  const visited = new Set<number>();
  let currentId: number | null = startPartnerId;

  while (currentId != null && !visited.has(currentId)) {
    visited.add(currentId);
    const partner = partnerMap.get(currentId);
    if (!partner) break;
    chain.push(partner);
    currentId = partner.businessLink?.businessParentId ?? null;
  }

  return chain;
}

/**
 * 着金額に対する手数料分配を自動計算する
 *
 * @param amount 着金額（売上金額）
 * @param referringPartnerId 案件紹介代理店ID（Project.partnerId）
 * @param partnerMap 事業内の代理店マップ（partnerId → partner + businessLink）
 * @param defaultCommissionBaseRate 事業デフォルトの元請手数料率（代理店にcommissionRateがない場合のフォールバック）
 * @returns 分配配列（自社取り分含む）
 */
export function calculateCommissionDistributions(
  amount: number,
  referringPartnerId: number | null,
  partnerMap: Map<number, PartnerWithLink>,
  defaultCommissionBaseRate?: number | null,
): DistributionInput[] {
  const distributions: DistributionInput[] = [];

  // 代理店なしの場合は自社100%
  if (referringPartnerId == null) {
    distributions.push({
      partnerId: null,
      tier: 1,
      tierLabel: '社内',
      rateType: 'DIRECT',
      commissionRate: 100,
      commissionAmount: amount,
    });
    return distributions;
  }

  // 代理店の階層チェーンを取得（紹介代理店 → 上位1 → 上位2 → ...）
  const chain = getPartnerChain(referringPartnerId, partnerMap);
  if (chain.length === 0) {
    distributions.push({
      partnerId: null,
      tier: 1,
      tierLabel: '社内',
      rateType: 'DIRECT',
      commissionRate: 100,
      commissionAmount: amount,
    });
    return distributions;
  }

  // 元請手数料率を取得（紹介代理店 or 繰り上げ先の代理店から）
  // 紹介代理店のcommissionRateを優先、なければデフォルト値、それもなければ100%
  const referringPartner = chain[0];
  const commissionBaseRate = Number(referringPartner.businessLink?.commissionRate ?? defaultCommissionBaseRate ?? 100);
  const commissionPool = Math.floor(amount * commissionBaseRate / 100);

  // Step 1-3: 直料率の適用先を決定（繰り上げ処理）
  let directPartnerIndex = -1;
  for (let i = 0; i < chain.length; i++) {
    const rate = Number(chain[i].businessLink?.directCommissionRate ?? 0);
    if (rate > 0) {
      directPartnerIndex = i;
      break;
    }
  }

  let tier = 2; // tier 1 は自社
  let totalPartnerAmount = 0;

  if (directPartnerIndex >= 0) {
    // 直料率適用代理店
    const directPartner = chain[directPartnerIndex];
    const directRate = Number(directPartner.businessLink?.directCommissionRate ?? 0);
    const directAmount = Math.floor(amount * directRate / 100);
    distributions.push({
      partnerId: directPartner.id,
      tier: tier++,
      tierLabel: `直（${directPartner.partnerName}）`,
      rateType: 'DIRECT',
      commissionRate: directRate,
      commissionAmount: directAmount,
    });
    totalPartnerAmount += directAmount;

    // Step 4: 直料率適用代理店より上位に間接料率を適用
    for (let i = directPartnerIndex + 1; i < chain.length; i++) {
      const partner = chain[i];
      const indirectRate = Number(partner.businessLink?.indirectCommissionRate ?? 0);
      if (indirectRate <= 0) continue;

      const indirectAmount = Math.floor(amount * indirectRate / 100);
      distributions.push({
        partnerId: partner.id,
        tier: tier++,
        tierLabel: `間（${partner.partnerName}）`,
        rateType: 'INDIRECT',
        commissionRate: indirectRate,
        commissionAmount: indirectAmount,
      });
      totalPartnerAmount += indirectAmount;
    }
  }

  // 自社取り分 = 元請手数料プール − 全代理店分配合計
  const companyAmount = commissionPool - totalPartnerAmount;
  const companyRate = amount > 0 ? Number(((companyAmount / amount) * 100).toFixed(4)) : 0;
  distributions.unshift({
    partnerId: null,
    tier: 1,
    tierLabel: '社内',
    rateType: 'DIRECT',
    commissionRate: companyRate,
    commissionAmount: companyAmount,
  });

  return distributions;
}

/**
 * 事業内の代理店マップを構築する
 */
export function buildPartnerMap(
  partners: {
    id: number;
    partnerName: string;
    partnerCode: string;
    businessLinks: {
      businessId: number;
      commissionRate: Prisma.Decimal | null;
      directCommissionRate: Prisma.Decimal | null;
      indirectCommissionRate: Prisma.Decimal | null;
      businessParentId: number | null;
    }[];
  }[],
  businessId: number
): Map<number, PartnerWithLink> {
  const map = new Map<number, PartnerWithLink>();
  for (const partner of partners) {
    const link = partner.businessLinks.find((l) => l.businessId === businessId);
    map.set(partner.id, {
      id: partner.id,
      partnerName: partner.partnerName,
      partnerCode: partner.partnerCode,
      businessLink: link ? {
        commissionRate: link.commissionRate,
        directCommissionRate: link.directCommissionRate,
        indirectCommissionRate: link.indirectCommissionRate,
        businessParentId: link.businessParentId,
      } : null,
    });
  }
  return map;
}
