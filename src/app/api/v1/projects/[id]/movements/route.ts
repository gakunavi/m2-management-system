import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/projects/:id/movements
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
      select: { id: true, businessId: true, projectCustomData: true },
    });
    if (!project) throw ApiError.notFound('案件が見つかりません');

    const movements = await prisma.projectMovement.findMany({
      where: { projectId },
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
            stepLinkedFieldKey: true,
          },
        },
      },
      orderBy: { template: { stepNumber: 'asc' } },
    });

    // 事業設定からフィールド定義を取得（連動フィールド情報用）
    const business = await prisma.business.findUnique({
      where: { id: project.businessId },
      select: { businessConfig: true },
    });
    const businessConfig = (business?.businessConfig ?? {}) as Record<string, unknown>;
    const projectFields = (businessConfig.projectFields ?? []) as Array<{ key: string; label: string; type: string; options?: string[] }>;
    const fieldMap = new Map(projectFields.map((f) => [f.key, f]));
    const customData = (project.projectCustomData ?? {}) as Record<string, unknown>;

    const data = movements.map((m) => {
      const linkedField = m.template.stepLinkedFieldKey ? fieldMap.get(m.template.stepLinkedFieldKey) : null;
      return {
        id: m.id,
        projectId: m.projectId,
        templateId: m.templateId,
        movementStatus: m.movementStatus,
        movementStartedAt: m.movementStartedAt?.toISOString() ?? null,
        movementCompletedAt: m.movementCompletedAt?.toISOString() ?? null,
        movementNotes: m.movementNotes,
        updatedAt: m.updatedAt.toISOString(),
        updatedBy: m.updatedBy,
        template: {
          ...m.template,
          linkedFieldLabel: linkedField?.label ?? null,
          linkedFieldType: linkedField?.type ?? null,
          linkedFieldOptions: linkedField?.options ?? null,
        },
        linkedFieldValue: m.template.stepLinkedFieldKey
          ? (customData[m.template.stepLinkedFieldKey] ?? null)
          : undefined,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
