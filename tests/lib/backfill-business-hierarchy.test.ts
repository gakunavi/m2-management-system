import { describe, it, expect, vi } from 'vitest';
import { computeBackfillPlan } from '@/lib/backfill-business-hierarchy';

// computeBackfillPlan は prisma.partnerBusinessLink.findMany と prisma.partner.findMany のみ使用。
function makePrisma(links: unknown[], partners: unknown[]) {
  return {
    partnerBusinessLink: { findMany: vi.fn().mockResolvedValue(links) },
    partner: { findMany: vi.fn().mockResolvedValue(partners) },
  } as never;
}

describe('computeBackfillPlan', () => {
  it('グローバル親が同事業に居れば business_parent_id 補完、居なければ1次店扱い、既設定は対象外', async () => {
    // 事業1: A(1) ルート, B(2)→A はグローバルのみ, C(3)→99(事業外), D(4)は既に事業別親=1, E(5)はグローバル親なし
    const partners = [
      { id: 1, parentId: null, partnerCode: 'A-001', partnerName: 'A社' },
      { id: 2, parentId: 1, partnerCode: 'A-002', partnerName: 'B社' },
      { id: 3, parentId: 99, partnerCode: 'A-003', partnerName: 'C社' },
      { id: 4, parentId: 1, partnerCode: 'A-004', partnerName: 'D社' },
      { id: 5, parentId: null, partnerCode: 'A-005', partnerName: 'E社' },
      { id: 99, parentId: null, partnerCode: 'X-099', partnerName: '事業外の親' },
    ];
    const links = [
      { id: 11, partnerId: 1, businessId: 1, businessTier: null, businessTierNumber: null, businessParentId: null },
      { id: 12, partnerId: 2, businessId: 1, businessTier: null, businessTierNumber: null, businessParentId: null },
      { id: 13, partnerId: 3, businessId: 1, businessTier: null, businessTierNumber: null, businessParentId: null },
      { id: 14, partnerId: 4, businessId: 1, businessTier: '2次代理店', businessTierNumber: 'A-001-1', businessParentId: 1 },
      { id: 15, partnerId: 5, businessId: 1, businessTier: null, businessTierNumber: null, businessParentId: null },
      // 99 は事業1に active リンクなし（事業外）
    ];

    const plan = await computeBackfillPlan(makePrisma(links, partners));

    // B社(2) → A社(1): 同事業に親がいるので補完
    expect(plan.assignments).toEqual([
      { businessId: 1, partnerId: 2, partnerName: 'B社', newParentId: 1, newParentName: 'A社' },
    ]);
    // C社(3): グローバル親99が事業1に居ない → 1次店扱い（報告のみ）
    expect(plan.parentOutsideBusiness).toEqual([
      { businessId: 1, partnerId: 3, partnerName: 'C社', globalParentId: 99, globalParentName: '事業外の親' },
    ]);
    // D社(4): 既に事業別親あり → 対象外
    expect(plan.alreadyHasBusinessParent).toBe(1);
    // A社(1)・E社(5): グローバル親なし
    expect(plan.noGlobalParent).toBe(2);
    expect(plan.totalActiveLinks).toBe(5);
  });

  it('別事業では同じ代理店でも親在籍判定が独立する', async () => {
    const partners = [
      { id: 1, parentId: null, partnerCode: 'A-001', partnerName: 'A社' },
      { id: 2, parentId: 1, partnerCode: 'A-002', partnerName: 'B社' },
    ];
    const links = [
      // 事業1: A,B 両方 active → B は補完される
      { id: 11, partnerId: 1, businessId: 1, businessTier: null, businessTierNumber: null, businessParentId: null },
      { id: 12, partnerId: 2, businessId: 1, businessTier: null, businessTierNumber: null, businessParentId: null },
      // 事業2: B のみ active（A は事業2に居ない）→ B は1次店扱い
      { id: 22, partnerId: 2, businessId: 2, businessTier: null, businessTierNumber: null, businessParentId: null },
    ];

    const plan = await computeBackfillPlan(makePrisma(links, partners));

    expect(plan.assignments).toEqual([
      { businessId: 1, partnerId: 2, partnerName: 'B社', newParentId: 1, newParentName: 'A社' },
    ]);
    expect(plan.parentOutsideBusiness).toEqual([
      { businessId: 2, partnerId: 2, partnerName: 'B社', globalParentId: 1, globalParentName: 'A社' },
    ]);
  });
});
