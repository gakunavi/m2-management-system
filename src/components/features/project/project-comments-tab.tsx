'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Pencil, Trash2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ============================================
// 型定義
// ============================================

interface CommentData {
  id: number;
  projectId: number;
  commentText: string;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  creator: { id: number; userName: string } | null;
}

interface CommentsResponse {
  success: boolean;
  data: CommentData[];
}

// ============================================
// ヘルパー
// ============================================

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ============================================
// スケルトン
// ============================================

function CommentsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Props
// ============================================

interface Props {
  entityId: number;
}

// ============================================
// メインコンポーネント
// ============================================

export function ProjectCommentsTab({ entityId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingComment, setDeletingComment] = useState<CommentData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: response,
    isLoading,
    error,
  } = useQuery<CommentsResponse>({
    queryKey: ['project-comments', entityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects/${entityId}/comments`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? 'コメントの取得に失敗しました');
      }
      return res.json();
    },
  });

  const comments = response?.data ?? [];

  const invalidateComments = () => {
    queryClient.invalidateQueries({ queryKey: ['project-comments', entityId] });
  };

  // ============================================
  // 新規投稿
  // ============================================

  const handleSubmit = async () => {
    const text = newComment.trim();
    if (!text) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/projects/${entityId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentText: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? 'コメントの投稿に失敗しました');
      }
      setNewComment('');
      invalidateComments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'コメントの投稿に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ============================================
  // 編集
  // ============================================

  const handleStartEdit = (comment: CommentData) => {
    setEditingId(comment.id);
    setEditText(comment.commentText);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return;

    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/v1/projects/${entityId}/comments/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentText: editText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? 'コメントの更新に失敗しました');
      }
      setEditingId(null);
      setEditText('');
      invalidateComments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'コメントの更新に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ============================================
  // 削除
  // ============================================

  const handleDeleteConfirm = async () => {
    if (!deletingComment) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/projects/${entityId}/comments/${deletingComment.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? 'コメントの削除に失敗しました');
      }
      toast({ message: 'コメントを削除しました', type: 'success' });
      setDeletingComment(null);
      invalidateComments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'コメントの削除に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // ============================================
  // ローディング / エラー
  // ============================================

  if (isLoading) return <CommentsSkeleton />;

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-destructive">
        {(error as Error).message ?? 'コメントの取得に失敗しました'}
      </div>
    );
  }

  // ============================================
  // レンダリング
  // ============================================

  return (
    <div className="space-y-6">
      {/* 投稿フォーム */}
      <div className="rounded-lg border bg-card p-4">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="コメントを入力...（Cmd+Enter で送信）"
          className="w-full min-h-[80px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={isSubmitting}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newComment.trim() || isSubmitting}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {isSubmitting ? '送信中...' : '投稿'}
          </Button>
        </div>
      </div>

      {/* コメント件数 */}
      {comments.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {comments.length} 件のコメント
        </p>
      )}

      {/* コメント一覧 / 空状態 */}
      {comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />}
          title="コメントはまだありません"
          description="案件に関するメモや引き継ぎ事項を投稿してください。"
        />
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => {
            const isEditing = editingId === comment.id;
            const isEdited = comment.createdAt !== comment.updatedAt;

            return (
              <div key={comment.id} className="flex gap-3">
                {/* アバター */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {comment.creator ? getInitial(comment.creator.userName) : '?'}
                </div>

                {/* 本文 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {comment.creator?.userName ?? '不明'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(comment.createdAt)}
                    </span>
                    {isEdited && (
                      <span className="text-xs text-muted-foreground">（編集済み）</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full min-h-[60px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={isSavingEdit}
                      />
                      <div className="mt-1.5 flex gap-1.5">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={handleSaveEdit}
                          disabled={!editText.trim() || isSavingEdit}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          disabled={isSavingEdit}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="group relative">
                      <p className="mt-1 text-sm whitespace-pre-wrap break-words text-foreground/90">
                        {comment.commentText}
                      </p>

                      {/* 操作ボタン */}
                      <div className="absolute -top-1 right-0 hidden group-hover:flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => handleStartEdit(comment)}
                          aria-label="コメントを編集"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-6 w-6 text-muted-foreground',
                            'hover:text-destructive hover:bg-destructive/10',
                          )}
                          onClick={() => setDeletingComment(comment)}
                          aria-label="コメントを削除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 削除確認モーダル */}
      <ConfirmModal
        open={deletingComment !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingComment(null);
        }}
        title="コメントを削除しますか？"
        description="このコメントを削除します。この操作は元に戻せません。"
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  );
}
