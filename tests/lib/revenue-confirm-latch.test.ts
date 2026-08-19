import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// ============================================
// 収益確定のラッチ（作成系経路の後処理）
// ============================================
//
// 「ステータスは購入済みなのに収益確定日が未設定」の案件を、確定日つき・凍結済みに
// する後処理。本番で CSV 取り込み由来の案件を5件取りこぼしていたため追加した。
// スナップショットの中身自体は reward-snapshot.test.ts が検証しているので、
// ここでは「どの案件を拾い、何を書き、何を書かないか」に絞る。

const { mockBuildSnapshot } = vi.hoisted(() => ({ mockBuildSnapshot: vi.fn() }));

vi.mock('@/lib/reward-helpers', () => ({
  buildRewardSnapshotForProject: (...args: unknown[]) => mockBuildSnapshot(...args),
}));

import { latchRevenueConfirmation } from '@/lib/revenue-confirm-latch';

const SNAPSHOT = { version: 1, capturedBy: 'confirm', chain: [] };

function makePrisma(opts: {
  statuses?: { statusCode: string }[];
  projects?: { id: number; partnerId: number | null; projectStatusChangedAt: Date | null }[];
}) {
  const update = vi.fn().mockResolvedValue({});
  const findManyStatuses = vi.fn().mockResolvedValue(opts.statuses ?? [{ statusCode: 'purchased' }]);
  const findManyProjects = vi.fn().mockResolvedValue(opts.projects ?? []);
  return {
    prisma: {
      businessStatusDefinition: { findMany: findManyStatuses },
      project: { findMany: findManyProjects, update },
    } as unknown as PrismaClient,
    update,
    findManyStatuses,
    findManyProjects,
  };
}

describe('latchRevenueConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildSnapshot.mockResolvedValue(SNAPSHOT);
  });

  it('ステータス変更日時を収益確定日にし、スナップショットを凍結する', async () => {
    const changedAt = new Date('2026-03-19T02:00:00Z');
    const { prisma, update } = makePrisma({
      projects: [{ id: 118, partnerId: 55, projectStatusChangedAt: changedAt }],
    });

    const result = await latchRevenueConfirmation(prisma, 5);

    expect(result).toEqual({ latched: 1, projectIds: [118] });
    expect(update).toHaveBeenCalledWith({
      where: { id: 118 },
      data: { revenueConfirmedAt: changedAt, rewardSnapshot: SNAPSHOT },
    });
    // 計上月がステータス変更時点になるよう、同じ日時で凍結する
    expect(mockBuildSnapshot).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ projectId: 118, partnerId: 55, capturedBy: 'confirm', capturedAt: changedAt }),
    );
  });

  it('version は上げない（呼び出し元が直前に更新済みのため二重に上がる）', async () => {
    const { prisma, update } = makePrisma({
      projects: [{ id: 1, partnerId: null, projectStatusChangedAt: new Date() }],
    });
    await latchRevenueConfirmation(prisma, 5);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('version');
  });

  it('収益確定ステータスが1つも定義されていない事業は何もしない', async () => {
    const { prisma, update, findManyProjects } = makePrisma({ statuses: [] });
    const result = await latchRevenueConfirmation(prisma, 5);
    expect(result.latched).toBe(0);
    // 案件を引きにすら行かない
    expect(findManyProjects).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('対象が無ければ何も書かない（冪等）', async () => {
    const { prisma, update } = makePrisma({ projects: [] });
    const result = await latchRevenueConfirmation(prisma, 5);
    expect(result).toEqual({ latched: 0, projectIds: [] });
    expect(update).not.toHaveBeenCalled();
  });

  it('projectIds が空配列なら即座に何もしない', async () => {
    const { prisma, findManyStatuses } = makePrisma({});
    const result = await latchRevenueConfirmation(prisma, 5, { projectIds: [] });
    expect(result).toEqual({ latched: 0, projectIds: [] });
    expect(findManyStatuses).not.toHaveBeenCalled();
  });

  it('未確定かつ収益確定ステータスの案件だけを対象にする', async () => {
    const { prisma, findManyProjects } = makePrisma({
      projects: [{ id: 1, partnerId: null, projectStatusChangedAt: new Date() }],
    });
    await latchRevenueConfirmation(prisma, 5, { projectIds: [1, 2] });

    const where = findManyProjects.mock.calls[0][0].where;
    expect(where).toMatchObject({
      businessId: 5,
      projectIsActive: true,
      revenueConfirmedAt: null,
      projectSalesStatus: { in: ['purchased'] },
      id: { in: [1, 2] },
    });
  });

  it('手数料設定の無い事業は確定日だけ入れ、凍結はしない', async () => {
    mockBuildSnapshot.mockResolvedValue(null);
    const changedAt = new Date('2026-05-25T00:00:00Z');
    const { prisma, update } = makePrisma({
      projects: [{ id: 7, partnerId: null, projectStatusChangedAt: changedAt }],
    });

    await latchRevenueConfirmation(prisma, 9);

    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { revenueConfirmedAt: changedAt },
    });
  });

  it('ステータス変更日時が無ければ現在時刻でラッチする', async () => {
    const { prisma, update } = makePrisma({
      projects: [{ id: 3, partnerId: null, projectStatusChangedAt: null }],
    });
    const before = Date.now();
    await latchRevenueConfirmation(prisma, 5);
    const used = update.mock.calls[0][0].data.revenueConfirmedAt as Date;
    expect(used.getTime()).toBeGreaterThanOrEqual(before);
  });
});
