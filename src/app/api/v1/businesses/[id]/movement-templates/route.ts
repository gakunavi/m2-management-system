import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

const createSchema = z.object({
  stepCode: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_]+$/, '英数字とアンダースコアのみ使用できます'),
  stepName: z.string().min(1).max(100),
  stepDescription: z.string().optional().nullable(),
  stepIsSalesLinked: z.boolean().default(false),
  stepLinkedStatusCode: z.string().max(50).optional().nullable(),
  visibleToPartner: z.boolean().default(false),
});

// ============================================
// GET /api/v1/businesses/:id/movement-templates
// ============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    const items = await prisma.movementTemplate.findMany({
      where: { businessId },
      orderBy: { stepNumber: 'asc' },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/businesses/:id/movement-templates
// ============================================
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
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessIsActive: true },
    });
    if (!business || !business.businessIsActive) throw ApiError.notFound('事業が見つかりません');

    const body = await request.json();
    const data = createSchema.parse(body);

    // stepCode の事業内一意チェック
    const existing = await prisma.movementTemplate.findFirst({
      where: { businessId, stepCode: data.stepCode },
    });
    if (existing) {
      throw ApiError.conflict('このステップコードはすでに使用されています');
    }

    // stepIsSalesLinked = true の場合、連動ステータスコードの存在確認
    if (data.stepIsSalesLinked && data.stepLinkedStatusCode) {
      const statusExists = await prisma.businessStatusDefinition.findFirst({
        where: { businessId, statusCode: data.stepLinkedStatusCode },
      });
      if (!statusExists) {
        throw ApiError.badRequest('指定した連動ステータスコードが見つかりません');
      }
    }

    // 最大 stepNumber + 1
    const maxStep = await prisma.movementTemplate.aggregate({
      where: { businessId },
      _max: { stepNumber: true },
    });
    const nextStepNumber = (maxStep._max.stepNumber ?? 0) + 1;

    const created = await prisma.movementTemplate.create({
      data: {
        businessId,
        stepNumber: nextStepNumber,
        stepCode: data.stepCode,
        stepName: data.stepName,
        stepDescription: data.stepDescription ?? null,
        stepIsSalesLinked: data.stepIsSalesLinked,
        stepLinkedStatusCode: data.stepLinkedStatusCode ?? null,
        visibleToPartner: data.visibleToPartner,
        stepIsActive: true,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
