'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  ChatConversationItem,
  ChatConversationDetail,
  ChatResponse,
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
// チャット送信フック
// ============================================

export function useChat() {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useMutation({
    mutationFn: async (params: {
      message: string;
      conversationId?: number;
      businessId?: number;
    }) => {
      setIsLoading(true);
      const res = await apiClient.create<ChatResponse>('/ai/chat', params);
      return res;
    },
    onSuccess: (data) => {
      // 会話一覧を更新
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      // 会話詳細を更新
      if (data.conversationId) {
        queryClient.invalidateQueries({
          queryKey: ['ai-conversation', data.conversationId],
        });
      }
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  return {
    sendMessage: sendMessage.mutate,
    sendMessageAsync: sendMessage.mutateAsync,
    isLoading,
    error: sendMessage.error,
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
