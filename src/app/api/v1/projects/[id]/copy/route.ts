import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { formatProject } from '@/lib/format-project';
import { generateProjectNo, createInitialMovements } from '@/lib/project-helpers';
import { latchRevenueConfirmation } from '@/lib/revenue-confirm-latch';
import { computeAllFormulas } from '@/lib/formula-evaluator';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

export const dynamic = 'force-dynamic';

// ============================================
// POST /api/v1/projects/:id/copy
// 案件（契約マスタ）をコピーして新規作成する
// ============================================
//
// コピーする  : 事業 / 顧客 / 代理店 / 営業ステータス / 受注予定月 / 担当者 /
//               備考 / カスタムデータ / 報酬・自社受取率の案件別上書き /
//               ストック固定期間 / ポータル表示 / 改装番号
// コピーしない: 案件番号（新規採番）/ 収益確定日・手数料スナップショット /
//               解約日 / version / ムーブメントの進捗（pending で作り直す）/
//               ファイル・コメント・リマインダー・報酬明細
//
// 営業ステータスはコピー元のまま引き継ぐ（業務上そのままの状態で複製したいため）。
// 収益確定フラグ付きステータスだった場合は POST /projects と同様にラッチが走り、
// コピー直後に収益確定（＝当月計上）となる。ここでラッチを省くと
// 「確定ステータスなのに revenueConfirmedAt が null」という不整合な案件ができ、
// /api/v1/rewards/warnings が検出し続ける状態になるため、あえて揃えている。

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const sourceId = parseInt(id, 10);
    if (isNaN(sourceId)) throw ApiError.notFound('案件が見つかりません');

    const source = await prisma.project.findUnique({ where: { id: sourceId } });
    if (!source) throw ApiError.notFound('案件が見つかりません');

    // staff は担当事業の案件のみコピーできる（一覧APIのスコープに合わせる）
    if (user.role === 'staff') {
      const assignment = await prisma.userBusinessAssignment.findFirst({
        where: { userId: user.id, businessId: source.businessId },
        select: { businessId: true },
      });
      if (!assignment) throw ApiError.forbidden('この事業の案件をコピーする権限がありません');
    }

    const business = await prisma.business.findFirst({
      where: { id: source.businessId, businessIsActive: true },
      select: { id: true, businessConfig: true },
    });
    if (!business) throw ApiError.badRequest('コピー元の事業が無効化されています');

    // formula フィールドは保存値をそのまま持ち込まず再計算する（POST と同じ扱い）
    const bizConfig = business.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projectFields = bizConfig?.projectFields ?? [];
    let customData = (source.projectCustomData ?? {}) as Record<string, unknown>;
    if (projectFields.some((f) => f.type === 'formula')) {
      customData = { ...customData, ...computeAllFormulas(projectFields, customData) };
    }

    const created = await prisma.$transaction(async (tx) => {
      const projectNo = await generateProjectNo(tx, source.businessId);

      const project = await tx.project.create({
        data: {
          businessId: source.businessId,
          customerId: source.customerId,
          partnerId: source.partnerId,
          projectNo,
          projectSalesStatus: source.projectSalesStatus,
          projectStatusChangedAt: new Date(),
          projectExpectedCloseMonth: source.projectExpectedCloseMonth,
          projectAssignedUserId: source.projectAssignedUserId,
          projectAssignedUserName: source.projectAssignedUserName,
          projectNotes: source.projectNotes,
          projectRenovationNumber: source.projectRenovationNumber,
          projectCustomData: customData as Prisma.InputJsonValue,
          portalVisible: source.portalVisible,
          // 未設定（null）のときは列に触れない。Json? へ null を書くと
          // DbNull / JsonNull の指定が必要になり、既存の「未設定＝null か {}」
          // という扱いと食い違うため
          ...(source.rewardOverride != null
            ? { rewardOverride: source.rewardOverride as Prisma.InputJsonValue }
            : {}),
          ...(source.companyShareOverride != null
            ? { companyShareOverride: source.companyShareOverride as Prisma.InputJsonValue }
            : {}),
          stockTermMonths: source.stockTermMonths,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      await createInitialMovements(tx, project.id, source.businessId);

      // 同じ顧客×事業なので通常は既に存在する。無い場合のみ作る
      await tx.customerBusinessLink.upsert({
        where: {
          customerId_businessId: {
            customerId: source.customerId,
            businessId: source.businessId,
          },
        },
        update: {},
        create: {
          customerId: source.customerId,
          businessId: source.businessId,
          linkStatus: 'active',
        },
      });

      return project;
    });

    // 収益確定ステータスのままコピーした場合の確定日セット＋手数料の凍結。
    // スナップショットの組み立てが事業設定・代理店階層を読むため、
    // トランザクションの外（案件が存在する状態）で呼ぶ。
    await latchRevenueConfirmation(prisma, source.businessId, {
      projectIds: [created.id],
    });

    const responseProject = await prisma.project.findUnique({
      where: { id: created.id },
      include: {
        customer: {
          select: {
            id: true, customerCode: true, customerName: true, customerFolderUrl: true,
            customerSalutation: true, customerType: true, customerWebsite: true,
            customerFiscalMonth: true,
          },
        },
        partner: {
          select: {
            id: true, partnerCode: true, partnerName: true, partnerFolderUrl: true,
            partnerSalutation: true,
          },
        },
        business: { select: { id: true, businessName: true } },
        assignedUser: { select: { id: true, userName: true } },
      },
    });

    return NextResponse.json(
      { success: true, data: formatProject(responseProject ?? created) },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
