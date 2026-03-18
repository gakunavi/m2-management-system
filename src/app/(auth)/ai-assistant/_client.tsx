'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Loader2, Settings, AlertCircle, Building2, MessageSquare, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
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
import { Button } from '@/components/ui/button';

interface AiStatus {
  configured: boolean;
  isAdmin: boolean;
}

export function AiAssistantClient() {
  const { toast } = useToast();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [pendingMessages, setPendingMessages] = useState<ChatMessageItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // ストリーミング中のアシスタント応答
  const [streamingContent, setStreamingContent] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { selectedBusinessId, businesses } = useBusiness();

  // AI用の事業コンテキスト（サイドバー選択をデフォルトに、独立して切替可能）
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

  // ストリーミングコールバック
  const { sendMessage, isLoading: chatLoading, statusMessage } = useChat({
    onDelta: (chunk) => {
      setStreamingContent((prev) => prev + chunk);
    },
    onDone: () => {
      // ストリーミング完了 → pendingとstreamingをクリア（DBから再取得される）
      setStreamingContent('');
      setPendingMessages([]);
    },
    onError: (msg) => {
      setStreamingContent('');
      setPendingMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `エラーが発生しました: ${msg}`,
          tableData: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast({ message: 'メッセージの送信に失敗しました', type: 'error' });
    },
  });

  // データフェッチ
  const { data: conversations, isLoading: convLoading } = useChatConversations();
  const { data: conversationDetail } = useChatConversation(activeConversationId);
  const deleteConversation = useDeleteConversation();

  // 表示するメッセージ
  const savedMessages = conversationDetail?.messages ?? [];
  const allMessages = [...savedMessages, ...pendingMessages];

  // スクロール追従
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length, streamingContent]);

  // 会話切り替え時にpendingをクリア
  useEffect(() => {
    setPendingMessages([]);
    setStreamingContent('');
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
      setStreamingContent('');

      try {
        const result = await sendMessage({
          message,
          conversationId: activeConversationId ?? undefined,
          businessId: aiBusinessId,
        });

        // 新規会話の場合、IDをセット
        if (!activeConversationId && result.conversationId) {
          setActiveConversationId(result.conversationId);
        }
      } catch {
        toast({ message: 'メッセージの送信に失敗しました', type: 'error' });
      }
    },
    [activeConversationId, aiBusinessId, sendMessage, toast],
  );

  const handleSelectConversation = useCallback((id: number) => {
    setActiveConversationId(id);
    setDrawerOpen(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setPendingMessages([]);
    setStreamingContent('');
    setDrawerOpen(false);
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
      <div className="flex items-center justify-center h-[calc(100dvh-80px)] sm:h-[calc(100dvh-120px)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // AI未設定時の表示
  if (!isConfigured) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-80px)] sm:h-[calc(100dvh-120px)]">
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
    <div className="flex h-[calc(100dvh-80px)] sm:h-[calc(100dvh-120px)] gap-0 rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* モバイル: 会話一覧ドロワー */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 border-r bg-background shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-200 md:hidden">
            <DialogPrimitive.Title className="sr-only">会話一覧</DialogPrimitive.Title>
            <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
              <span className="sr-only">閉じる</span>
            </DialogPrimitive.Close>
            <ConversationList
              conversations={conversations ?? []}
              activeId={activeConversationId}
              onSelect={handleSelectConversation}
              onNew={handleNewConversation}
              onDelete={handleDeleteConversation}
              isLoading={convLoading}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* デスクトップ: 会話一覧サイドバー */}
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
        <div className="flex items-center gap-1.5 sm:gap-2 border-b px-3 sm:px-4 py-2.5 sm:py-3">
          {/* モバイル: 会話一覧ボタン */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 md:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Bot className="h-5 w-5 text-primary hidden sm:block shrink-0" />
          <h2 className="font-semibold text-[13px] sm:text-sm truncate min-w-0 flex-1">
            {conversationDetail?.title ?? 'AIアシスタント'}
          </h2>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select
              value={aiBusinessValue === '__init__' ? 'all' : aiBusinessValue}
              onValueChange={setAiBusinessValue}
            >
              <SelectTrigger className="h-8 w-[100px] sm:w-[180px] text-xs">
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
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {allMessages.length === 0 && !streamingContent ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4">
              <Bot className="h-10 w-10 sm:h-12 sm:w-12 mb-3 sm:mb-4 opacity-30" />
              <p className="text-sm font-medium mb-1">AIアシスタント</p>
              <p className="text-xs text-center max-w-sm">
                営業データに関する質問ができます。
              </p>
              <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-1.5 sm:gap-2 w-full max-w-md">
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
                    className="rounded-lg border px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs text-left hover:bg-muted active:bg-muted transition-colors disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {allMessages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {/* ストリーミング中のアシスタント応答 */}
              {streamingContent && (
                <ChatMessage
                  message={{
                    id: -1,
                    role: 'assistant',
                    content: streamingContent,
                    tableData: null,
                    createdAt: new Date().toISOString(),
                  }}
                />
              )}
            </>
          )}

          {/* ステータス表示（データ取得中等） */}
          {chatLoading && statusMessage && !streamingContent && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg bg-muted px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {statusMessage}
                </div>
              </div>
            </div>
          )}

          {/* ローディングインジケーター（初期状態、ストリーム開始前） */}
          {chatLoading && !statusMessage && !streamingContent && pendingMessages.length > 0 && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg bg-muted px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  回答を準備中...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 入力エリア */}
        <div className="border-t p-3 sm:p-4">
          <ChatInput onSend={handleSend} isLoading={chatLoading} />
          <p className="mt-1 sm:mt-1.5 text-[10px] sm:text-[11px] text-muted-foreground text-center">
            AIの回答は参考情報です。重要な判断の際は実データを確認してください。
          </p>
        </div>
      </div>
    </div>
  );
}
