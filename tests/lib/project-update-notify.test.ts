import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// 案件の更新で ML管理システムへ project.updated を知らせる
//
// 画面の PATCH /api/v1/projects/[id] と ML連携の PATCH は同じ
// applyProjectUpdate を通る。ここでは「営業担当を変えたときも通知が出る」ことを
// 共通実装の側で固定する（ステータス変更だけが通知の引き金ではない）。
// ============================================================================

const { mockPrisma, mockBuildSnapshot, mockCreateNotifications } = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    mockPrisma: {
      project: model(),
      business: model(),
      businessStatusDefinition: model(),
      integrationOutboxEvent: model(),
      $transaction: vi.fn(),
    },
    mockBuildSnapshot: vi.fn(),
    mockCreateNotifications: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/reward-helpers', () => ({ buildRewardSnapshotForProject: mockBuildSnapshot }));
vi.mock('@/lib/notification-helper', () => ({
  createNotificationsForUsers: mockCreateNotifications,
}));

import { applyProjectUpdate } from '@/lib/project-update';
import { userActor } from '@/lib/update-actor';
import { mlActorFromRequest } from '@/lib/update-actor';
import { NextRequest } from 'next/server';

const LIGHT_BUSINESS_ID = 5;

function existingProject(over: Record<string, unknown> = {}) {
  return {
    id: 123,
    version: 4,
    projectSalesStatus: 'informal_approval',
    projectCustomData: {},
    businessId: LIGHT_BUSINESS_ID,
    revenueConfirmedAt: null,
    partnerId: null,
    ...over,
  };
}

function updatedProject(over: Record<string, unknown> = {}) {
  return {
    id: 123,
    projectNo: 'LIGHT-0077',
    projectSalesStatus: 'informal_approval',
    projectStatusChangedAt: new Date('2026-11-06T01:00:00.000Z'),
    projectAssignedUserId: 7,
    projectAssignedUserName: '鈴木 一郎',
    projectCustomData: {},
    businessId: LIGHT_BUSINESS_ID,
    version: 5,
    rewardSnapshot: null,
    revenueConfirmedAt: null,
    customer: { id: 11, customerCode: 'CST-0001', businessLinks: [], customerCustomData: {} },
    partner: null,
    ...over,
  };
}

function stub(businessId = LIGHT_BUSINESS_ID) {
  mockPrisma.project.findUnique.mockResolvedValue(existingProject({ businessId }));
  mockPrisma.project.update.mockResolvedValue(updatedProject({ businessId }));
  mockPrisma.business.findFirst.mockResolvedValue({
    id: LIGHT_BUSINESS_ID,
    businessCode: 'LIGHT',
  });
  mockPrisma.businessStatusDefinition.findFirst.mockResolvedValue({
    statusLabel: '3_内諾',
    statusColor: null,
  });
  mockPrisma.integrationOutboxEvent.create.mockResolvedValue({ id: 1 });
  mockPrisma.integrationOutboxEvent.findMany.mockResolvedValue([]);
}

const ADMIN = userActor({ id: 1, role: 'admin', userName: '石井' });

/** 営業担当だけを変える更新 */
const ASSIGNEE_BODY = {
  version: 4,
  projectAssignedUserId: 7,
  projectAssignedUserName: '鈴木 一郎',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTEGRATION_BUSINESS_CODE = 'LIGHT';
  process.env.ML_WEBHOOK_URL = 'https://ml.example.test/webhooks/m2';
  process.env.ML_WEBHOOK_SECRET = 'shhh';
  mockBuildSnapshot.mockResolvedValue(null);
});

describe('営業担当を変えたとき', () => {
  it('営業担当が保存され、ML へ project.updated を知らせる', async () => {
    stub();

    const { updated } = await applyProjectUpdate(mockPrisma as never, {
      projectId: 123,
      body: ASSIGNEE_BODY,
      actor: ADMIN,
    });

    const data = mockPrisma.project.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.projectAssignedUserId).toBe(7);
    expect(data.projectAssignedUserName).toBe('鈴木 一郎');
    expect(updated.projectAssignedUserName).toBe('鈴木 一郎');

    const event = mockPrisma.integrationOutboxEvent.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(event.eventType).toBe('project.updated');
    expect(event.projectNo).toBe('LIGHT-0077');
    // 本文に値（担当者名）は入れない
    expect(JSON.stringify(event)).not.toContain('鈴木');
  });

  it('受注予定月だけ変えても ML へ知らせる', async () => {
    stub();

    await applyProjectUpdate(mockPrisma as never, {
      projectId: 123,
      body: { version: 4, projectExpectedCloseMonth: '2027-03' },
      actor: ADMIN,
    });

    const data = mockPrisma.project.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.projectExpectedCloseMonth).toBe('2027-03');

    const event = mockPrisma.integrationOutboxEvent.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(event.eventType).toBe('project.updated');
    expect(event.projectNo).toBe('LIGHT-0077');
    // 本文に値（月）は入れない
    expect(JSON.stringify(event)).not.toContain('2027-03');
  });

  it('ステータスは変えていないので社内通知は作らない', async () => {
    stub();

    await applyProjectUpdate(mockPrisma as never, {
      projectId: 123,
      body: ASSIGNEE_BODY,
      actor: ADMIN,
    });

    expect(mockCreateNotifications).not.toHaveBeenCalled();
  });

  it('ライト事業以外の案件では知らせない', async () => {
    stub(99);

    await applyProjectUpdate(mockPrisma as never, {
      projectId: 123,
      body: ASSIGNEE_BODY,
      actor: ADMIN,
    });

    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('通知先が未設定なら控えも作らない', async () => {
    stub();
    delete process.env.ML_WEBHOOK_URL;
    delete process.env.ML_WEBHOOK_SECRET;

    await applyProjectUpdate(mockPrisma as never, {
      projectId: 123,
      body: ASSIGNEE_BODY,
      actor: ADMIN,
    });

    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('ML から来た更新は知らせ返さない（ループ防止）', async () => {
    stub();
    const result = mlActorFromRequest(
      new NextRequest('https://manage.example.test/api/integrations/projects/LIGHT-0077', {
        method: 'PATCH',
        headers: { 'x-ml-user': encodeURIComponent('山田太郎') },
      }),
    );
    expect(result.ok).toBe(true);

    await applyProjectUpdate(mockPrisma as never, {
      projectId: 123,
      body: ASSIGNEE_BODY,
      actor: result.ok ? result.actor : ADMIN,
    });

    expect(mockPrisma.integrationOutboxEvent.create).not.toHaveBeenCalled();
  });
});
