import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/v1/ai/conversations/:id — 会話詳細
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const conversationId = parseInt(params.id, 10);
    if (isNaN(conversationId)) throw ApiError.badRequest('不正なID');

    const conversation = await prisma.chatConversation.findFirst({
      where: { id: conversationId, userId: user.id },
      select: {
        id: true,
        title: true,
        businessId: true,
        business: { select: { businessName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            tableData: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) throw ApiError.notFound('会話が見つかりません');

    return NextResponse.json({
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        businessId: conversation.businessId,
        businessName: conversation.business?.businessName ?? null,
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          tableData: m.tableData,
          createdAt: m.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// DELETE /api/v1/ai/conversations/:id — 会話削除
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const conversationId = parseInt(params.id, 10);
    if (isNaN(conversationId)) throw ApiError.badRequest('不正なID');

    const conversation = await prisma.chatConversation.findFirst({
      where: { id: conversationId, userId: user.id },
    });
    if (!conversation) throw ApiError.notFound('会話が見つかりません');

    await prisma.chatConversation.delete({
      where: { id: conversationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// PATCH /api/v1/ai/conversations/:id — タイトル変更
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const conversationId = parseInt(params.id, 10);
    if (isNaN(conversationId)) throw ApiError.badRequest('不正なID');

    const conversation = await prisma.chatConversation.findFirst({
      where: { id: conversationId, userId: user.id },
    });
    if (!conversation) throw ApiError.notFound('会話が見つかりません');

    const body = await request.json();
    const { title } = body as { title?: string };

    if (!title || typeof title !== 'string') {
      throw ApiError.badRequest('タイトルを入力してください');
    }

    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { title: title.slice(0, 200) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
