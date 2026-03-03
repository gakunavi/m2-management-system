'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Globe, Lock, Eye, Paperclip, X, Upload, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface QaCategory {
  id: number;
  categoryName: string;
  categoryIsActive: boolean;
}

interface QaAttachment {
  id: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
}

interface QaItemDetail {
  id: number;
  categoryId: number;
  businessId: number | null;
  businessName: string | null;
  itemTitle: string;
  itemQuestion: string;
  itemAnswer: string;
  itemStatus: 'draft' | 'published';
  itemIsPublic: boolean;
  itemViewCount: number;
  itemSortOrder: number;
  createdAt: string;
  updatedAt: string;
  category: { categoryName: string };
  creator: { id: number; userName: string };
  attachments: QaAttachment[];
}

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  if (status === 'published') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
        公開中
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      下書き
    </Badge>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface EditFormProps {
  item: QaItemDetail;
  categories: QaCategory[];
  onCancel: () => void;
  onSuccess: () => void;
}

function EditForm({ item, categories, onCancel, onSuccess }: EditFormProps) {
  const { toast } = useToast();
  const { businesses } = useBusiness();
  const [categoryId, setCategoryId] = useState(String(item.categoryId));
  const [businessId, setBusinessId] = useState(
    item.businessId !== null ? String(item.businessId) : 'common',
  );
  const [title, setTitle] = useState(item.itemTitle);
  const [question, setQuestion] = useState(item.itemQuestion);
  const [answer, setAnswer] = useState(item.itemAnswer);
  const [isPublic, setIsPublic] = useState(item.itemIsPublic);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !title.trim() || !answer.trim()) {
      toast({ message: '必須項目を入力してください', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/qa/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: Number(categoryId),
          businessId: businessId === 'common' ? null : Number(businessId),
          itemTitle: title.trim(),
          itemQuestion: question.trim(),
          itemAnswer: answer.trim(),
          itemIsPublic: isPublic,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ message: 'QA項目を更新しました', type: 'success' });
      onSuccess();
    } catch {
      toast({ message: 'QA項目の更新に失敗しました', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 border rounded-lg p-5">
      <p className="text-sm font-medium">編集モード</p>

      <div className="space-y-1.5">
        <Label htmlFor="edit-category">
          カテゴリ <span className="text-destructive">*</span>
        </Label>
        <Select value={categoryId || undefined} onValueChange={setCategoryId}>
          <SelectTrigger id="edit-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={String(cat.id)}>
                {cat.categoryName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-business">対象事業</Label>
        <Select value={businessId} onValueChange={setBusinessId}>
          <SelectTrigger id="edit-business">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="common">全社共通</SelectItem>
            {businesses.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.businessName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-title">
          タイトル <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-question">質問</Label>
        <textarea
          id="edit-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-answer">
          回答 <span className="text-destructive">*</span>
        </Label>
        <textarea
          id="edit-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={8}
          required
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="edit-public"
          checked={isPublic}
          onCheckedChange={(v) => setIsPublic(Boolean(v))}
        />
        <Label htmlFor="edit-public" className="cursor-pointer">
          一般公開する
        </Label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={submitting || !categoryId || !title.trim() || !answer.trim()}>
          {submitting ? '保存中...' : '保存する'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          キャンセル
        </Button>
      </div>
    </form>
  );
}

interface AttachmentsSectionProps {
  itemId: number;
  attachments: QaAttachment[];
  onRefresh: () => void;
}

function AttachmentsSection({ itemId, attachments, onRefresh }: AttachmentsSectionProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/v1/qa/items/${itemId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      toast({ message: 'ファイルをアップロードしました', type: 'success' });
      onRefresh();
    } catch {
      toast({ message: 'ファイルのアップロードに失敗しました', type: 'error' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (attachmentId: number, fileName: string) => {
    if (!confirm(`「${fileName}」を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/v1/qa/items/${itemId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      toast({ message: 'ファイルを削除しました', type: 'success' });
      onRefresh();
    } catch {
      toast({ message: 'ファイルの削除に失敗しました', type: 'error' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">添付ファイル ({attachments.length})</p>
        <label className="cursor-pointer">
          <input
            type="file"
            className="sr-only"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <Button type="button" variant="outline" size="sm" asChild>
            <span>
              <Upload className="h-4 w-4 mr-1.5" />
              {uploading ? 'アップロード中...' : 'ファイルを追加'}
            </span>
          </Button>
        </label>
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">添付ファイルはありません</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-3 border rounded-md px-3 py-2">
              <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
              <a
                href={att.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm text-primary hover:underline truncate"
              >
                {att.fileName}
              </a>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatBytes(att.fileSize)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => handleDelete(att.id, att.fileName)}
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">削除</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function QaDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { hasRole, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const itemQueryKey = ['qa-item', id];

  const { data: item, isLoading: itemLoading } = useQuery<QaItemDetail>({
    queryKey: itemQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/v1/qa/items/${id}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
  });

  const { data: categories = [] } = useQuery<QaCategory[]>({
    queryKey: ['qa-categories'],
    queryFn: async () => {
      const res = await fetch('/api/v1/qa/categories');
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error('No item');
      const newStatus = item.itemStatus === 'published' ? 'draft' : 'published';
      const res = await fetch(`/api/v1/qa/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemStatus: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemQueryKey });
      queryClient.invalidateQueries({ queryKey: ['qa-items'] });
      queryClient.invalidateQueries({ queryKey: ['qa-items-manage'] });
      toast({
        message: item?.itemStatus === 'published' ? '下書きに戻しました' : '公開しました',
        type: 'success',
      });
    },
    onError: () => toast({ message: 'ステータスの変更に失敗しました', type: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/qa/items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-items'] });
      queryClient.invalidateQueries({ queryKey: ['qa-items-manage'] });
      toast({ message: 'QA項目を削除しました', type: 'success' });
      router.push('/qa/manage');
    },
    onError: () => toast({ message: 'QA項目の削除に失敗しました', type: 'error' }),
  });

  const handleDelete = () => {
    if (!confirm('このQA項目を削除しますか？この操作は元に戻せません。')) return;
    deleteMutation.mutate();
  };

  useEffect(() => {
    if (!authLoading && !hasRole(['admin', 'staff'])) {
      router.replace('/qa');
    }
  }, [authLoading, hasRole, router]);

  if (authLoading || itemLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="QA詳細"
          breadcrumbs={[
            { label: 'QA/ナレッジベース', href: '/qa' },
            { label: 'QA管理', href: '/qa/manage' },
            { label: 'QA詳細' },
          ]}
        />
        <p className="text-sm text-muted-foreground">QA項目が見つかりません。</p>
      </div>
    );
  }

  const activeCategories = categories.filter((c) => c.categoryIsActive);

  return (
    <div className="space-y-6">
      <PageHeader
        title="QA詳細"
        breadcrumbs={[
          { label: 'QA/ナレッジベース', href: '/qa' },
          { label: 'QA管理', href: '/qa/manage' },
          { label: 'QA詳細' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-1.5" />
                編集
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleStatusMutation.mutate()}
              disabled={toggleStatusMutation.isPending}
            >
              {item.itemStatus === 'published' ? (
                <>
                  <Lock className="h-4 w-4 mr-1.5" />
                  下書きに戻す
                </>
              ) : (
                <>
                  <Globe className="h-4 w-4 mr-1.5" />
                  公開する
                </>
              )}
            </Button>
            {isAdmin && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                削除
              </Button>
            )}
          </div>
        }
      />

      {/* Meta info */}
      <div className="flex flex-wrap gap-3 items-center">
        <StatusBadge status={item.itemStatus} />
        {item.itemIsPublic ? (
          <Badge variant="outline" className="gap-1 text-xs">
            <Globe className="h-3 w-3" />
            一般公開
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-xs">
            <Lock className="h-3 w-3" />
            非公開
          </Badge>
        )}
        <Badge variant="secondary" className="gap-1 text-xs">
          <Eye className="h-3 w-3" />
          {item.itemViewCount} 閲覧
        </Badge>
        {item.businessName ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            {item.businessName}
          </span>
        ) : (
          <Badge variant="outline" className="text-xs">全社共通</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          カテゴリ: {item.category.categoryName}
        </span>
        <span className="text-xs text-muted-foreground">
          作成者: {item.creator.userName}
        </span>
        <span className="text-xs text-muted-foreground">
          作成日: {new Date(item.createdAt).toLocaleDateString('ja-JP')}
        </span>
      </div>

      {/* Edit form or read-only view */}
      {editing ? (
        <EditForm
          item={item}
          categories={activeCategories}
          onCancel={() => setEditing(false)}
          onSuccess={() => {
            setEditing(false);
            queryClient.invalidateQueries({ queryKey: itemQueryKey });
            queryClient.invalidateQueries({ queryKey: ['qa-items-manage'] });
          }}
        />
      ) : (
        <div className="space-y-6 border rounded-lg p-5">
          <div>
            <p className="text-lg font-semibold mb-1">{item.itemTitle}</p>
          </div>

          {item.itemQuestion && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                質問
              </p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.itemQuestion}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              回答
            </p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.itemAnswer}</p>
          </div>
        </div>
      )}

      {/* Attachments */}
      <div className="border rounded-lg p-5">
        <AttachmentsSection
          itemId={item.id}
          attachments={item.attachments}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: itemQueryKey })}
        />
      </div>
    </div>
  );
}
