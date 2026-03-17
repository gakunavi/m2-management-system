import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/error-handler';
import { processChatStream, generateConversationTitle, AiNotConfiguredError } from '@/lib/ai/openai-client';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { StreamEvent } from '@/lib/ai/openai-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_HISTORY_MESSAGES = 20;

// ============================================
// POST /api/v1/ai/chat — SSE ストリーミング応答
// ============================================

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  function sendSSE(event: StreamEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as {
      id: number;
      name: string;
      role: string;
      partnerId?: number | null;
    };
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

      const newBusinessId = businessId ?? null;
      if (existing.businessId !== newBusinessId) {
        await prisma.chatConversation.update({
          where: { id: existing.id },
          data: { businessId: newBusinessId },
        });
        existing.businessId = newBusinessId;
      }

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
    // 事業コンテキストの解決
    // ============================================

    let businessName: string | null = null;
    const resolvedBusinessId = conversation.businessId ?? businessId ?? null;
    if (resolvedBusinessId) {
      const biz = await prisma.business.findUnique({
        where: { id: resolvedBusinessId },
        select: { businessName: true },
      });
      businessName = biz?.businessName ?? null;
    }

    // ============================================
    // SSE ストリーミング応答
    // ============================================

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // conversationIdを即座に送信
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'init', conversationId: conversation.id })}\n\n`,
            ),
          );

          const fullContent = await processChatStream(
            chatMessages,
            {
              id: user.id,
              role: user.role,
              partnerId: user.partnerId,
              name: user.name,
              businessId: resolvedBusinessId,
              businessName,
            },
            (event: StreamEvent) => {
              controller.enqueue(encoder.encode(sendSSE(event)));
            },
          );

          // アシスタント応答をDB保存
          await prisma.chatMessage.create({
            data: {
              conversationId: conversation.id,
              role: 'assistant',
              content: fullContent,
            },
          });

          // タイトル生成 or updatedAt更新
          if (!conversationId) {
            const title = await generateConversationTitle(message);
            await prisma.chatConversation.update({
              where: { id: conversation.id },
              data: { title },
            });
          } else {
            await prisma.chatConversation.update({
              where: { id: conversation.id },
              data: { updatedAt: new Date() },
            });
          }

          controller.close();
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(
            encoder.encode(sendSSE({ type: 'error', message: errMsg })),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    // SSE開始前のエラー（認証、バリデーション等）はJSONで返す
    if (error instanceof AiNotConfiguredError) {
      return Response.json(
        { success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI機能が設定されていません' } },
        { status: 503 },
      );
    }
    if (error instanceof ApiError) {
      return Response.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode },
      );
    }
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '内部エラーが発生しました' } },
      { status: 500 },
    );
  }
}
