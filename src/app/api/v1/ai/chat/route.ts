import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { processChat, generateConversationTitle, AiNotConfiguredError } from '@/lib/ai/openai-client';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_HISTORY_MESSAGES = 20;

// ============================================
// POST /api/v1/ai/chat
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as {
      id: number;
      name: string;
      role: string;
      partnerId?: number | null;
    };
    // admin/staff のみ（Phase 1）
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();
    const { message, conversationId, businessId } = body as {
      message?: string;
      conversationId?: number;
      businessId?: number;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw ApiError.badRequest('メッセージを入力してください');
    }
    if (message.length > 2000) {
      throw ApiError.badRequest('メッセージは2000文字以内で入力してください');
    }

    // ============================================
    // 会話の取得 or 新規作成
    // ============================================

    let conversation: { id: number; businessId: number | null };

    if (conversationId) {
      const existing = await prisma.chatConversation.findFirst({
        where: { id: conversationId, userId: user.id },
        select: { id: true, businessId: true },
      });
      if (!existing) throw ApiError.notFound('会話が見つかりません');
      conversation = existing;
    } else {
      conversation = await prisma.chatConversation.create({
        data: {
          userId: user.id,
          businessId: businessId ?? null,
          title: null,
        },
        select: { id: true, businessId: true },
      });
    }

    // ============================================
    // ユーザーメッセージをDB保存
    // ============================================

    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message.trim(),
      },
    });

    // ============================================
    // 会話履歴の取得（直近N件）
    // ============================================

    const historyMessages = await prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true },
    });

    const chatMessages: ChatCompletionMessageParam[] = historyMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // ============================================
    // OpenAI に送信して応答取得
    // ============================================

    const aiResponse = await processChat(chatMessages, {
      id: user.id,
      role: user.role,
      partnerId: user.partnerId,
      name: user.name,
    });

    // ============================================
    // アシスタント応答をDB保存
    // ============================================

    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse.content,
      },
    });

    // ============================================
    // 新規会話の場合、タイトルを自動生成
    // ============================================

    if (!conversationId) {
      const title = await generateConversationTitle(message);
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { title },
      });
    } else {
      // updatedAt を更新
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        conversationId: conversation.id,
        message: aiResponse.content,
        tableData: null,
      },
    });
  } catch (error) {
    // AI未設定エラーは専用レスポンス
    if (error instanceof AiNotConfiguredError) {
      return NextResponse.json(
        { success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI機能が設定されていません' } },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}
