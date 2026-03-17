'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Loader2, Settings, AlertCircle, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { ChatMessage } from '@/components/features/ai/chat-message';
import { ChatInput } from '@/components/features/ai/chat-input';
import { ConversationList } from '@/components/features/ai/conversation-list';
import {
  useChat,
  useChatConversations,
  useChatConversation,
  useDeleteConversation,
} from '@/hooks/use-chat';
import { useBusiness } from '@/hooks/use-business';
import { apiClient } from '@/lib/api-client';
import type { ChatMessageItem } from '@/types/chat';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AiStatus {
  configured: boolean;
  isAdmin: boolean;
}

export function AiAssistantClient() {
  const { toast } = useToast();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [pendingMessages, setPendingMessages] = useState<ChatMessageItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { selectedBusinessId, businesses } = useBusiness();

  // AI用の事業コンテキスト（サイドバー選択をデフォルトに、独立して切替可能）
  // "all" = 全事業、数値文字列 = 特定事業ID
  const [aiBusinessValue, setAiBusinessValue] = useState<string>('__init__');

  // サイドバー選択をデフォルトとして初期化（初回のみ）
  useEffect(() => {
    if (aiBusinessValue === '__init__') {
      setAiBusinessValue(selectedBusinessId !== null ? String(selectedBusinessId) : 'all');
    }
  }, [selectedBusinessId, aiBusinessValue]);

  const aiBusinessId = aiBusinessValue === 'all' || aiBusinessValue === '__init__'
    ? undefined
    : Number(aiBusinessValue);

  // AI設定状態チェック
  const { data: aiStatus, isLoading: statusLoading } = useQuery<AiStatus>({
    queryKey: ['ai-status'],
    queryFn: () => apiClient.get('/ai/status'),
    staleTime: 30_000,
  });

  const isConfigured = aiStatus?.configured ?? false;
  const isAdmin = aiStatus?.isAdmin ?? false;

  // データフェッチ
  const { data: conversations, isLoading: convLoading } = useChatConversations();
  const { data: conversationDetail } = useChatConversation(activeConversationId);
  const { sendMessageAsync, isLoading: chatLoading } = useChat();
  const deleteConversation = useDeleteConversation();

  // 表示するメッセージ
  const savedMessages = conversationDetail?.messages ?? [];
  const allMessages = [...savedMessages, ...pendingMessages];

  // スクロール追従
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  // 会話切り替え時にpendingをクリアし、会話の事業コンテキストを復元
  useEffect(() => {
    setPendingMessages([]);
  }, [activeConversationId]);

  // 既存会話を選択した際、その会話の事業コンテキストを復元
  useEffect(() => {
    if (conversationDetail) {
      setAiBusinessValue(
        conversationDetail.businessId !== null
          ? String(conversationDetail.businessId)
          : 'all',
      );
    }
  }, [conversationDetail]);

  const handleSend = useCallback(
    async (message: string) => {
      // ユーザーメッセージを即座に表示
      const userMsg: ChatMessageItem = {
        id: Date.now(),
        role: 'user',
        content: message,
        tableData: null,
        createdAt: new Date().toISOString(),
      };
      setPendingMessages((prev) => [...prev, userMsg]);

      try {
        const response = await sendMessageAsync({
          message,
          conversationId: activeConversationId ?? undefined,
          businessId: aiBusinessId,
        });

        // 新規会話の場合、IDをセット
        if (!activeConversationId && response.conversationId) {
          setActiveConversationId(response.conversationId);
        }

        // pendingをクリア（DBから再取得される）
        setPendingMessages([]);
      } catch {
        // エラー時はアシスタントエラーメッセージを追加
        setPendingMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: 'エラーが発生しました。しばらく待ってから再度お試しください。',
            tableData: null,
            createdAt: new Date().toISOString(),
          },
        ]);
        toast({ message: 'メッセージの送信に失敗しました', type: 'error' });
      }
    },
    [activeConversationId, aiBusinessId, sendMessageAsync, toast],
  );

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setPendingMessages([]);
  }, []);

  const handleDeleteConversation = useCallback(
    (id: number) => {
      if (!confirm('この会話を削除しますか？')) return;
      deleteConversation.mutate(id, {
        onSuccess: () => {
          if (activeConversationId === id) {
            setActiveConversationId(null);
          }
          toast({ message: '会話を削除しました', type: 'success' });
        },
      });
    },
    [activeConversationId, deleteConversation, toast],
  );

  // ローディング中
  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // AI未設定時の表示
  if (!isConfigured) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center max-w-md space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">AIアシスタントが設定されていません</h2>
          <p className="text-sm text-muted-foreground">
            AIアシスタントを利用するには、OpenAI APIキーの設定が必要です。
          </p>
          {isAdmin ? (
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Settings className="h-4 w-4" />
              システム設定を開く
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              管理者に設定を依頼してください。
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* 左: 会話一覧 */}
      <div className="w-72 shrink-0 border-r bg-muted/30 hidden md:block">
        <ConversationList
          conversations={conversations ?? []}
          activeId={activeConversationId}
          onSelect={setActiveConversationId}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          isLoading={convLoading}
        />
      </div>

      {/* 右: チャットエリア */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ヘッダー */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-sm">
            {conversationDetail?.title ?? 'AIアシスタント'}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select
              value={aiBusinessValue === '__init__' ? 'all' : aiBusinessValue}
              onValueChange={setAiBusinessValue}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="事業を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全事業</SelectItem>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.businessName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chatLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {allMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bot className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm font-medium mb-1">AIアシスタント</p>
              <p className="text-xs text-center max-w-sm">
                営業データに関する質問ができます。
                <br />
                例: 「今月の受注見込みは何件？」「一番売ってる代理店は？」
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md">
                {[
                  '今月のKPIサマリーを教えて',
                  '代理店ランキングを表にして',
                  'パイプラインの状況は？',
                  '売上推移を見せて',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    disabled={chatLoading}
                    className="rounded-lg border px-3 py-2 text-xs text-left hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            allMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))
          )}

          {/* ローディングインジケーター */}
          {chatLoading && pendingMessages.length > 0 && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg bg-muted px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  回答を生成中...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 入力エリア */}
        <div className="border-t p-4">
          <ChatInput onSend={handleSend} isLoading={chatLoading} />
          <p className="mt-1.5 text-[11px] text-muted-foreground text-center">
            AIの回答は参考情報です。重要な判断の際は実データを確認してください。
          </p>
        </div>
      </div>
    </div>
  );
}
