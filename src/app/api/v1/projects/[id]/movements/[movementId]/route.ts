import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { requireInternalUser } from '@/lib/authz';
import { updateMovementSchema } from '@/lib/validations/movement';
import { applyMovementUpdate } from '@/lib/project-movement-update';
import { userActor } from '@/lib/update-actor';

// ============================================
// PATCH /api/v1/projects/:id/movements/:movementId
// ============================================
//
// 更新そのものは ML連携と共通（src/lib/project-movement-update.ts）。
// ここは認証・権限チェックとレスポンス整形だけを持つ。

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; movementId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();
    requireInternalUser(session);

    const user = session.user as { id: number; role: string; userName?: string | null };
    const { id, movementId } = await params;
    const projectId = parseInt(id, 10);
    const mvId = parseInt(movementId, 10);

    const body = await request.json();
    const data = updateMovementSchema.parse(body);

    const updated = await applyMovementUpdate(prisma, {
      projectId,
      target: { kind: 'id', movementId: mvId },
      fields: data,
      actor: userActor(user),
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
