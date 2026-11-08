import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatProject } from '@/lib/format-project';
import { getBusinessPartnerScope } from '@/lib/revenue-helpers';
import { computeAllFormulas } from '@/lib/formula-evaluator';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';
import { parseRewardSnapshot, visibleRewardSnapshot } from '@/lib/reward-snapshot';
import {
  calculateProjectFinancials,
  canSeeCompanyRevenue,
  visibleFinancials,
} from '@/lib/profit-helpers';
// 更新ロジックは画面と ML連携（/api/integrations/projects/[project_no]）で共有する。
// ここに書き戻すと、ステータス変更の副作用（確定日ラッチ・手数料の凍結・通知）が
// 片方だけに入る事故が起きる。
import { applyProjectUpdate, PROJECT_INCLUDE } from '@/lib/project-update';
import { userActor } from '@/lib/update-actor';
import { notifyProjectChangedToMl } from '@/lib/ml-scope';

/**
 * この案件を含む「確定済み」の支払明細書が既にあるか。
 *
 * 確定済み明細は代理店へ発行済みの書類で、金額も率もスナップショット保存されている。
 * その案件の料率を後から訂正すると発行済みの書類と食い違うため、画面で警告を出す
 * （運用判断により訂正自体はブロックせず、差額は次月の明細で調整する）。
 */
async function partnerNamesForSnapshot(
  snapshot: { chain: { partnerId: number }[] } | null,
): Promise<Record<number, string>> {
  if (!snapshot || snapshot.chain.length === 0) return {};
  const partners = await prisma.partner.findMany({
    where: { id: { in: snapshot.chain.map((n) => n.partnerId) } },
    select: { id: true, partnerName: true },
  });
  return Object.fromEntries(partners.map((p) => [p.id, p.partnerName]));
}

async function hasConfirmedStatementForProject(projectId: number): Promise<boolean> {
  const entry = await prisma.rewardEntry.findFirst({
    where: { projectId, statement: { status: 'confirmed' } },
    select: { id: true },
  });
  return entry !== null;
}

// ============================================
// GET /api/v1/projects/:id
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: PROJECT_INCLUDE,
    });

    if (!project) throw ApiError.notFound('案件が見つかりません');

    // 代理店ユーザーのアクセス制御
    const user = session.user as { id: number; role: string; partnerId: number | null };
    if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      // ポータル非表示の案件は代理店ユーザーにアクセス不可
      if (!project.portalVisible) {
        throw ApiError.forbidden('この案件へのアクセス権がありません');
      }
    }
    if (user.role === 'partner_admin' && user.partnerId) {
      const partnerIds = await getBusinessPartnerScope(prisma, user.partnerId, project.businessId);
      if (!partnerIds.includes(project.partnerId ?? -1)) {
        throw ApiError.forbidden('この案件へのアクセス権がありません');
      }
    } else if (user.role === 'partner_staff') {
      if (project.projectAssignedUserId !== user.id) {
        throw ApiError.forbidden('この案件へのアクセス権がありません');
      }
    }

    // ステータス定義を付加
    const statusDef = await prisma.businessStatusDefinition.findFirst({
      where: { businessId: project.businessId, statusCode: project.projectSalesStatus },
      select: { statusLabel: true, statusColor: true },
    });

    // formula フィールドの計算値を注入
    const customData = project.projectCustomData as Record<string, unknown> | null;
    const flatCustom: Record<string, unknown> = {};
    if (customData) {
      for (const [k, v] of Object.entries(customData)) {
        flatCustom[`customData_${k}`] = v;
      }
    }
    const business = await prisma.business.findUnique({
      where: { id: project.businessId },
      select: { businessConfig: true },
    });
    const bizConfig = business?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projectFields = bizConfig?.projectFields ?? [];
    if (projectFields.some((f) => f.type === 'formula')) {
      const formulaResults = computeAllFormulas(projectFields, customData);
      for (const [k, v] of Object.entries(formulaResults)) {
        flatCustom[`customData_${k}`] = v;
      }
    }

    // 顧客・代理店カスタムデータを展開
    const customerObj = project.customer as Record<string, unknown> | null;
    const custLinks = (customerObj?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
    const custLink = custLinks.find((l) => l.businessId === project.businessId);
    const custLinkData = (custLink?.linkCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(custLinkData)) flatCustom[`customerLink_${k}`] = v;
    const custGlobalData = (customerObj?.customerCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(custGlobalData)) flatCustom[`customerGlobal_${k}`] = v;

    const partnerObj = project.partner as Record<string, unknown> | null;
    const partLinks = (partnerObj?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
    const partLink = partLinks.find((l) => l.businessId === project.businessId);
    const partLinkData = (partLink?.linkCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(partLinkData)) flatCustom[`partnerLink_${k}`] = v;
    const partGlobalData = (partnerObj?.partnerCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(partGlobalData)) flatCustom[`partnerGlobal_${k}`] = v;

    // 報酬・自社売上・粗利（一覧 GET と同じキー集合を返す）。
    // 自社取り分・粗利は社内情報なので代理店ロールには値を伏せる
    const financials = visibleFinancials(
      await calculateProjectFinancials(prisma, project.businessId, project.id),
      canSeeCompanyRevenue(user.role),
    );

    // 凍結スナップショットと「発行済み明細があるか」。案件詳細の報酬タブで
    // 確定済み料率の確認・訂正を行うために返す。訂正が発行済み明細と食い違う
    // 可能性を画面で警告するため、明細の有無もここで併せて返す。
    const rewardSnapshot = visibleRewardSnapshot(
      parseRewardSnapshot(project.rewardSnapshot),
      canSeeCompanyRevenue(user.role),
    );
    const hasConfirmedRewardStatement = await hasConfirmedStatementForProject(project.id);
    // 凍結値は代理店IDしか持たないので、画面に出す名前をここで引く
    const rewardSnapshotPartnerNames = await partnerNamesForSnapshot(rewardSnapshot);

    return NextResponse.json({
      success: true,
      data: {
        ...formatProject(project),
        ...flatCustom,
        ...financials,
        rewardSnapshot,
        rewardSnapshotPartnerNames,
        hasConfirmedRewardStatement,
        customerLinkCustomData: custLinkData,
        customerCustomData: custGlobalData,
        partnerLinkCustomData: partLinkData,
        partnerCustomData: partGlobalData,
        projectSalesStatusLabel: statusDef?.statusLabel ?? null,
        projectSalesStatusColor: statusDef?.statusColor ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/projects/:id
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; userName?: string | null };
    const { id } = await params;
    const projectId = parseInt(id, 10);

    const body = await request.json();

    // 更新本体（バリデーション・楽観ロック・ステータス変更の副作用）は共通実装。
    // ML連携の PATCH も同じ関数を通る。
    const { updated, statusDef } = await applyProjectUpdate(prisma, {
      projectId,
      body,
      actor: userActor(user),
    });

    // customData をフラットキーに展開（一覧キャッシュ直接更新で EditableCell の URL 型検出用）
    const updatedCustomData = updated.projectCustomData as Record<string, unknown> | null;
    const flatCustom: Record<string, unknown> = {};
    if (updatedCustomData) {
      for (const [k, v] of Object.entries(updatedCustomData)) {
        flatCustom[`customData_${k}`] = v;
      }
    }
    // formula フィールドの計算値を注入
    const bizForPatch = await prisma.business.findUnique({
      where: { id: updated.businessId },
      select: { businessConfig: true },
    });
    const patchBizConfig = bizForPatch?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const patchFields = patchBizConfig?.projectFields ?? [];
    if (patchFields.some((f) => f.type === 'formula')) {
      const formulaResults = computeAllFormulas(patchFields, updatedCustomData);
      for (const [k, v] of Object.entries(formulaResults)) {
        flatCustom[`customData_${k}`] = v;
      }
    }

    // 顧客・代理店カスタムデータを展開（PATCHレスポンスでも一覧と同じキーを返す）
    const patchCustomerObj = updated.customer as Record<string, unknown> | null;
    const patchCustLinks = (patchCustomerObj?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
    const patchCustLink = patchCustLinks.find((l) => l.businessId === updated.businessId);
    const patchCustLinkData = (patchCustLink?.linkCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patchCustLinkData)) flatCustom[`customerLink_${k}`] = v;
    const patchCustGlobalData = (patchCustomerObj?.customerCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patchCustGlobalData)) flatCustom[`customerGlobal_${k}`] = v;

    const patchPartnerObj = updated.partner as Record<string, unknown> | null;
    const patchPartLinks = (patchPartnerObj?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
    const patchPartLink = patchPartLinks.find((l) => l.businessId === updated.businessId);
    const patchPartLinkData = (patchPartLink?.linkCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patchPartLinkData)) flatCustom[`partnerLink_${k}`] = v;
    const patchPartGlobalData = (patchPartnerObj?.partnerCustomData ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(patchPartGlobalData)) flatCustom[`partnerGlobal_${k}`] = v;

    // 顧客/代理店の基本フィールドとversionをフラット展開（GETと同じ構造を返す）
    const patchCustomerFlat: Record<string, unknown> = {};
    const customer = updated.customer as Record<string, unknown> | null;
    if (customer) {
      patchCustomerFlat.customerName = (customer.customerName as string) ?? null;
      patchCustomerFlat.customerSalutation = (customer.customerSalutation as string) ?? null;
      patchCustomerFlat.customerType = (customer.customerType as string) ?? null;
      patchCustomerFlat.customerWebsite = (customer.customerWebsite as string) ?? null;
      patchCustomerFlat.customerFiscalMonth = (customer.customerFiscalMonth as number) ?? null;
      patchCustomerFlat.customerFolderUrl = (customer.customerFolderUrl as string) ?? null;
      patchCustomerFlat.customerVersion = (customer.version as number) ?? null;
    }
    const patchPartnerFlat: Record<string, unknown> = {};
    const partner = updated.partner as Record<string, unknown> | null;
    if (partner) {
      patchPartnerFlat.partnerName = (partner.partnerName as string) ?? null;
      patchPartnerFlat.partnerCode = (partner.partnerCode as string) ?? null;
      patchPartnerFlat.partnerSalutation = (partner.partnerSalutation as string) ?? null;
      patchPartnerFlat.partnerFolderUrl = (partner.partnerFolderUrl as string) ?? null;
      patchPartnerFlat.partnerVersion = (partner.version as number) ?? null;
    }

    // 報酬・自社売上・粗利を再計算して返す。
    // インライン編集は PATCH レスポンスで一覧の行を丸ごと置換するため、ここで
    // 返さないと一覧の報酬・収益列が消える（GET 一覧と同じキー集合が必要）。
    // 収益確定日・解約日・取り分上書きの変更で値自体も変わるので再計算が要る。
    const patchFinancials = visibleFinancials(
      await calculateProjectFinancials(prisma, updated.businessId, updated.id),
      canSeeCompanyRevenue(user.role),
    );
    // GET 詳細と同じキー集合を返す（返し漏れると報酬タブの表示が消える）
    const patchRewardSnapshot = visibleRewardSnapshot(
      parseRewardSnapshot(updated.rewardSnapshot),
      canSeeCompanyRevenue(user.role),
    );
    const patchHasConfirmedStatement = await hasConfirmedStatementForProject(updated.id);
    const patchSnapshotPartnerNames = await partnerNamesForSnapshot(patchRewardSnapshot);

    return NextResponse.json({
      success: true,
      data: {
        ...formatProject(updated),
        ...flatCustom,
        ...patchCustomerFlat,
        ...patchPartnerFlat,
        ...patchFinancials,
        rewardSnapshot: patchRewardSnapshot,
        rewardSnapshotPartnerNames: patchSnapshotPartnerNames,
        hasConfirmedRewardStatement: patchHasConfirmedStatement,
        customerLinkCustomData: patchCustLinkData,
        customerCustomData: patchCustGlobalData,
        partnerLinkCustomData: patchPartLinkData,
        partnerCustomData: patchPartGlobalData,
        projectSalesStatusLabel: statusDef?.statusLabel ?? null,
        projectSalesStatusColor: statusDef?.statusColor ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/projects/:id
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; userName?: string | null };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const existing = await prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) throw ApiError.notFound('案件が見つかりません');

    await prisma.project.update({
      where: { id: projectId },
      data: { projectIsActive: false, updatedBy: user.id },
    });

    // 一括削除と同じ扱い（ML が読み直すと 404 で「消えた」と分かる）
    await notifyProjectChangedToMl(prisma, userActor(user), {
      businessId: existing.businessId,
      projectNo: existing.projectNo,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
