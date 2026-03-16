import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { updateMovementSchema } from '@/lib/validations/movement';
import type { Prisma } from '@prisma/client';

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
            stepLinkedFieldKey: true,
            stepName: true,
          },
        },
      },
    });
    if (!existing) throw ApiError.notFound('ムーブメントが見つかりません');

    const now = new Date();

    // タイムスタンプの設定（明示的な日付指定がある場合はそちらを優先）
    const timestamps: {
      movementStartedAt?: Date | null;
      movementCompletedAt?: Date | null;
    } = {};

    if (data.movementStartedAt !== undefined) {
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

    // トランザクション: ムーブメント更新 + 連動フィールド更新
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
              stepLinkedFieldKey: true,
            },
          },
        },
      });

      // 連動フィールド更新: linkedFieldUpdate が送信された場合
      if (data.linkedFieldUpdate) {
        const { key, value } = data.linkedFieldUpdate;
        // テンプレートの連動フィールドキーと一致するか検証
        if (existing.template.stepLinkedFieldKey && key === existing.template.stepLinkedFieldKey) {
          const project = await tx.project.findUniqueOrThrow({
            where: { id: projectId },
            select: { projectCustomData: true },
          });
          const currentCustomData = (project.projectCustomData ?? {}) as Record<string, unknown>;
          const updatedCustomData = { ...currentCustomData, [key]: value };

          await tx.project.update({
            where: { id: projectId },
            data: {
              projectCustomData: updatedCustomData as Prisma.InputJsonValue,
              updatedBy: user.id,
              version: { increment: 1 },
            },
          });
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
    });
  } catch (error) {
    return handleApiError(error);
  }
}
