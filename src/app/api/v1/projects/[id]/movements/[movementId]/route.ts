import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { updateMovementSchema } from '@/lib/validations/movement';

// ============================================
// PATCH /api/v1/projects/:id/movements/:movementId
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; movementId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    const { id, movementId } = await params;
    const projectId = parseInt(id, 10);
    const mvId = parseInt(movementId, 10);

    const body = await request.json();
    const data = updateMovementSchema.parse(body);

    // ムーブメントの存在確認 + テンプレート情報取得
    const existing = await prisma.projectMovement.findFirst({
      where: { id: mvId, projectId },
      include: {
        template: {
          select: {
            stepIsSalesLinked: true,
            stepLinkedStatusCode: true,
            stepName: true,
          },
        },
      },
    });
    if (!existing) throw ApiError.notFound('ムーブメントが見つかりません');

    const now = new Date();
    let statusLinkedLabel: string | null = null;

    // タイムスタンプの設定（明示的な日付指定がある場合はそちらを優先）
    const timestamps: {
      movementStartedAt?: Date | null;
      movementCompletedAt?: Date | null;
    } = {};

    if (data.movementStartedAt !== undefined) {
      // 明示的に送信された場合はそのまま使用
      timestamps.movementStartedAt = data.movementStartedAt ? new Date(data.movementStartedAt) : null;
    }
    if (data.movementCompletedAt !== undefined) {
      timestamps.movementCompletedAt = data.movementCompletedAt ? new Date(data.movementCompletedAt) : null;
    }

    // 明示的な日付指定がない場合のみ、ステータスに応じた自動設定
    if (data.movementStatus && data.movementStartedAt === undefined && data.movementCompletedAt === undefined) {
      switch (data.movementStatus) {
        case 'started':
          timestamps.movementStartedAt = existing.movementStartedAt ?? now;
          timestamps.movementCompletedAt = null;
          break;
        case 'completed':
          timestamps.movementStartedAt = existing.movementStartedAt ?? now;
          timestamps.movementCompletedAt = now;
          break;
        case 'skipped':
          timestamps.movementCompletedAt = now;
          break;
        case 'pending':
          timestamps.movementStartedAt = null;
          timestamps.movementCompletedAt = null;
          break;
      }
    }

    // トランザクション: ムーブメント更新 + 営業ステータス連動
    const updated = await prisma.$transaction(async (tx) => {
      const movement = await tx.projectMovement.update({
        where: { id: mvId },
        data: {
          ...(data.movementStatus !== undefined && { movementStatus: data.movementStatus }),
          ...(data.movementNotes !== undefined && { movementNotes: data.movementNotes || null }),
          ...timestamps,
          updatedBy: user.id,
        },
        include: {
          template: {
            select: {
              id: true,
              stepNumber: true,
              stepCode: true,
              stepName: true,
              stepDescription: true,
              stepIsSalesLinked: true,
              stepLinkedStatusCode: true,
            },
          },
        },
      });

      // ステータス連動: completed かつ salesLinked の場合
      if (
        data.movementStatus === 'completed' &&
        existing.template.stepIsSalesLinked &&
        existing.template.stepLinkedStatusCode
      ) {
        const statusCode = existing.template.stepLinkedStatusCode;

        // ステータス定義の存在確認
        const statusDef = await tx.businessStatusDefinition.findFirst({
          where: {
            businessId: (await tx.project.findUniqueOrThrow({
              where: { id: projectId },
              select: { businessId: true },
            })).businessId,
            statusCode,
            statusIsActive: true,
          },
          select: { statusLabel: true },
        });

        if (statusDef) {
          await tx.project.update({
            where: { id: projectId },
            data: {
              projectSalesStatus: statusCode,
              projectStatusChangedAt: now,
              updatedBy: user.id,
              version: { increment: 1 },
            },
          });
          statusLinkedLabel = statusDef.statusLabel;
        }
      }

      return movement;
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        projectId: updated.projectId,
        templateId: updated.templateId,
        movementStatus: updated.movementStatus,
        movementStartedAt: updated.movementStartedAt?.toISOString() ?? null,
        movementCompletedAt: updated.movementCompletedAt?.toISOString() ?? null,
        movementNotes: updated.movementNotes,
        updatedAt: updated.updatedAt.toISOString(),
        updatedBy: updated.updatedBy,
        template: updated.template,
      },
      // ステータス連動が発生した場合、クライアントに通知
      ...(statusLinkedLabel ? { statusLinked: { label: statusLinkedLabel } } : {}),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
