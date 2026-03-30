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
 * 6. 自社取り分 = 着金額 − 全代理店分配合計
 */

interface PartnerWithLink {
  id: number;
  partnerName: string;
  partnerCode: string;
  businessLink: {
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
 * partnerMap: partnerId → PartnerWithLink
 * Returns: 紹介代理店から上位への順序付きリスト
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
 * @param amount 着金額
 * @param referringPartnerId 案件紹介代理店ID（Project.partnerId）
 * @param partnerMap 事業内の代理店マップ（partnerId → partner + businessLink）
 * @returns 分配配列（自社取り分含む）
 */
export function calculateCommissionDistributions(
  amount: number,
  referringPartnerId: number | null,
  partnerMap: Map<number, PartnerWithLink>
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
    // 代理店情報が取れない場合は自社100%
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
      // Step 5: 料率0%はスキップ
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

  // Step 6: 自社取り分（tier = 1, 先頭に挿入）
  const companyAmount = amount - totalPartnerAmount;
  distributions.unshift({
    partnerId: null,
    tier: 1,
    tierLabel: '社内',
    rateType: 'DIRECT',
    commissionRate: Number(((companyAmount / amount) * 100).toFixed(4)),
    commissionAmount: companyAmount,
  });

  return distributions;
}

/**
 * 事業内の代理店マップを構築する
 * PartnerBusinessLink のデータから partnerId → PartnerWithLink のマップを返す
 */
export function buildPartnerMap(
  partners: {
    id: number;
    partnerName: string;
    partnerCode: string;
    businessLinks: {
      businessId: number;
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
        directCommissionRate: link.directCommissionRate,
        indirectCommissionRate: link.indirectCommissionRate,
        businessParentId: link.businessParentId,
      } : null,
    });
  }
  return map;
}
