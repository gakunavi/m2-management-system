'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  ChatConversationItem,
  ChatConversationDetail,
} from '@/types/chat';

// ============================================
// 会話一覧
// ============================================

export function useChatConversations() {
  return useQuery<ChatConversationItem[]>({
    queryKey: ['ai-conversations'],
    queryFn: () => apiClient.get<ChatConversationItem[]>('/ai/conversations'),
    staleTime: 30_000,
  });
}

// ============================================
// 会話詳細（メッセージ付き）
// ============================================

export function useChatConversation(conversationId: number | null) {
  return useQuery<ChatConversationDetail>({
    queryKey: ['ai-conversation', conversationId],
    queryFn: () => apiClient.get<ChatConversationDetail>(`/ai/conversations/${conversationId}`),
    enabled: conversationId !== null,
    staleTime: 0,
  });
}

// ============================================
// チャット送信フック（SSE ストリーミング対応）
// ============================================

interface SendParams {
  message: string;
  conversationId?: number;
  businessId?: number;
}

interface StreamCallbacks {
  onDelta?: (chunk: string) => void;
  onStatus?: (message: string) => void;
  onDone?: (fullContent: string, conversationId: number) => void;
  onError?: (message: string) => void;
}

export function useChat(callbacks?: StreamCallbacks) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (params: SendParams): Promise<{ conversationId: number }> => {
      setIsLoading(true);
      setStatusMessage(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let resolvedConversationId = params.conversationId ?? 0;

      try {
        const response = await fetch('/api/v1/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        // SSEでない場合（認証エラー等）はJSONレスポンス
        const contentType = response.headers.get('Content-Type') ?? '';
        if (!contentType.includes('text/event-stream')) {
          const json = await response.json();
          const errMsg = json?.error?.message ?? 'エラーが発生しました';
          throw new Error(errMsg);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('ストリームを取得できませんでした');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // 最後の不完全行をバッファに残す
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              switch (event.type) {
                case 'init':
                  resolvedConversationId = event.conversationId;
                  break;
                case 'status':
                  setStatusMessage(event.message);
                  callbacks?.onStatus?.(event.message);
                  break;
                case 'delta':
                  setStatusMessage(null);
                  callbacks?.onDelta?.(event.content);
                  break;
                case 'done':
                  callbacks?.onDone?.(event.content, resolvedConversationId);
                  break;
                case 'error':
                  callbacks?.onError?.(event.message);
                  break;
              }
            } catch {
              // JSONパースエラーは無視
            }
          }
        }

        // キャッシュ更新
        queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
        if (resolvedConversationId) {
          queryClient.invalidateQueries({
            queryKey: ['ai-conversation', resolvedConversationId],
          });
        }

        return { conversationId: resolvedConversationId };
      } finally {
        setIsLoading(false);
        setStatusMessage(null);
        abortRef.current = null;
      }
    },
    [callbacks, queryClient],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    sendMessage,
    isLoading,
    statusMessage,
    abort,
  };
}

// ============================================
// 会話削除
// ============================================

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: number) => {
      await apiClient.remove('/ai/conversations', conversationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
  });
}
