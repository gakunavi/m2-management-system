import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { syncMovementsForTemplate, deleteMovementsForTemplate } from '@/lib/project-helpers';

const updateSchema = z.object({
  stepName: z.string().min(1).max(100).optional(),
  stepDescription: z.string().optional().nullable(),
  stepIsSalesLinked: z.boolean().optional(),
  stepLinkedStatusCode: z.string().max(50).optional().nullable(),
  stepIsActive: z.boolean().optional(),
  visibleToPartner: z.boolean().optional(),
});

// ============================================
// PATCH /api/v1/businesses/:id/movement-templates/:templateId
// ============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, templateId } = await params;
    const businessId = parseInt(id, 10);
    const tmplId = parseInt(templateId, 10);
    if (isNaN(businessId) || isNaN(tmplId)) throw ApiError.notFound();

    const current = await prisma.movementTemplate.findFirst({
      where: { id: tmplId, businessId },
    });
    if (!current) throw ApiError.notFound('テンプレートが見つかりません');

    const body = await request.json();
    // stepCode は更新不可
    const { stepCode: _, ...rest } = body; // eslint-disable-line @typescript-eslint/no-unused-vars
    const data = updateSchema.parse(rest);

    // 連動ステータスコードの存在確認
    const isSalesLinked = data.stepIsSalesLinked ?? current.stepIsSalesLinked;
    const linkedCode = data.stepLinkedStatusCode ?? current.stepLinkedStatusCode;
    if (isSalesLinked && linkedCode) {
      const statusExists = await prisma.businessStatusDefinition.findFirst({
        where: { businessId, statusCode: linkedCode },
      });
      if (!statusExists) {
        throw ApiError.badRequest('指定した連動ステータスコードが見つかりません');
      }
    }

    // stepIsActive の変更を検知して ProjectMovement を同期
    const stepIsActiveChanged = data.stepIsActive !== undefined && data.stepIsActive !== current.stepIsActive;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.movementTemplate.update({
        where: { id: tmplId },
        data,
      });

      if (stepIsActiveChanged) {
        if (data.stepIsActive) {
          // 無効 → 有効: 既存全案件に ProjectMovement を追加
          await syncMovementsForTemplate(tx, tmplId, businessId);
        } else {
          // 有効 → 無効: 関連する全 ProjectMovement を削除
          await deleteMovementsForTemplate(tx, tmplId);
        }
      }

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/businesses/:id/movement-templates/:templateId
// ============================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id, templateId } = await params;
    const businessId = parseInt(id, 10);
    const tmplId = parseInt(templateId, 10);
    if (isNaN(businessId) || isNaN(tmplId)) throw ApiError.notFound();

    const current = await prisma.movementTemplate.findFirst({
      where: { id: tmplId, businessId },
    });
    if (!current) throw ApiError.notFound('テンプレートが見つかりません');

    await prisma.$transaction(async (tx) => {
      // 関連する全 ProjectMovement を先に削除（FK制約回避）
      await deleteMovementsForTemplate(tx, tmplId);

      await tx.movementTemplate.delete({ where: { id: tmplId } });

      // 残りのテンプレートの stepNumber を再計算
      const remaining = await tx.movementTemplate.findMany({
        where: { businessId },
        orderBy: { stepNumber: 'asc' },
        select: { id: true },
      });
      await Promise.all(
        remaining.map((t, idx) =>
          tx.movementTemplate.update({
            where: { id: t.id },
            data: { stepNumber: idx + 1 },
          })
        )
      );
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
