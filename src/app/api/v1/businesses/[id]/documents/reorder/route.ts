import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

// ============================================
// PUT /api/v1/businesses/:id/documents/reorder
// ドキュメントの表示順を一括更新
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const businessId = parseInt(id, 10);

    const body = (await request.json()) as {
      orderedIds?: number[];
      documentType?: string;
    };

    if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
      throw new ApiError('VALIDATION_ERROR', 'orderedIds は必須です', 400);
    }
    if (!body.documentType || !['material', 'invoice'].includes(body.documentType)) {
      throw new ApiError('VALIDATION_ERROR', 'documentType（material または invoice）は必須です', 400);
    }

    // 全IDがこの事業・種別に属するか検証
    const docs = await prisma.businessDocument.findMany({
      where: { businessId, documentType: body.documentType, id: { in: body.orderedIds } },
      select: { id: true },
    });
    const existingIds = new Set(docs.map((d) => d.id));
    for (const docId of body.orderedIds) {
      if (!existingIds.has(docId)) {
        throw new ApiError('VALIDATION_ERROR', `ドキュメントID ${docId} が見つかりません`, 400);
      }
    }

    // トランザクションで一括更新
    await prisma.$transaction(
      body.orderedIds.map((docId, index) =>
        prisma.businessDocument.update({
          where: { id: docId },
          data: { documentSortOrder: index + 1 },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
