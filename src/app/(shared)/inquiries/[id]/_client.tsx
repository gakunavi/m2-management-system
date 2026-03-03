'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Calendar,
  User,
  Paperclip,
  Trash2,
  CheckCircle,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { InquiryStatusBadge, type InquiryStatus } from '../_client';

// --- Types ---

interface InquiryAttachment {
  id: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  createdAt: string;
}

interface InquiryDetail {
  id: number;
  inquirySubject: string;
  inquiryBody: string;
  inquiryStatus: InquiryStatus;
  inquiryBusinessId: number | null;
  inquiryCategoryId: number | null;
  inquiryProjectId: number | null;
  inquiryAssignedUserId: number | null;
  inquiryResponse: string | null;
  inquiryRespondedAt: string | null;
  inquiryRespondedBy: number | null;
  inquiryIsConvertedToQa: boolean;
  inquiryConvertedQaId: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: number;
  business: { id: number; businessName: string } | null;
  category: { id: number; categoryName: string } | null;
  creator: { id: number; userName: string };
  assignedUser: { id: number; userName: string } | null;
  respondedByUser: { id: number; userName: string } | null;
  project: { id: number; projectName: string } | null;
  convertedQa: { id: number; itemTitle: string } | null;
  attachments: InquiryAttachment[];
}

interface QaCategory {
  id: number;
  categoryName: string;
}

// --- Fetch ---

async function fetchInquiry(id: string): Promise<InquiryDetail> {
  const res = await fetch(`/api/v1/inquiries/${id}`);
  if (!res.ok) throw new Error('問い合わせの取得に失敗しました');
  const json = await res.json();
  return json.data as InquiryDetail;
}

async function fetchQaCategories(): Promise<QaCategory[]> {
  const res = await fetch('/api/v1/qa/categories');
  if (!res.ok) throw new Error('カテゴリの取得に失敗しました');
  const json = await res.json();
  return json.data as QaCategory[];
}

// --- Helpers ---

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Sub-components ---

interface ResponseSectionProps {
  inquiry: InquiryDetail;
  isInternalUser: boolean;
  onRespond: (response: string) => Promise<void>;
}

function ResponseSection({ inquiry, isInternalUser, onRespond }: ResponseSectionProps) {
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasResponse = Boolean(inquiry.inquiryResponse);
  const canRespond =
    isInternalUser &&
    !hasResponse &&
    inquiry.inquiryStatus !== 'converted_to_qa';

  const handleSubmit = async () => {
    if (!responseText.trim()) {
      setError('回答内容を入力してください');
      return;
    }
    setSubmitting(true);
    try {
      await onRespond(responseText.trim());
      setResponseText('');
      setError('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle className="h-4 w-4 text-green-600" />
          回答
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasResponse ? (
          <div className="space-y-3">
            <div className="rounded-md bg-green-50 border border-green-200 p-4">
              <p className="text-sm whitespace-pre-wrap">{inquiry.inquiryResponse}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {inquiry.respondedByUser && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {inquiry.respondedByUser.userName}
                </span>
              )}
              {inquiry.inquiryRespondedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateTime(inquiry.inquiryRespondedAt)}
                </span>
              )}
            </div>
          </div>
        ) : canRespond ? (
          <div className="space-y-3">
            <Textarea
              value={responseText}
              onChange={(e) => {
                setResponseText(e.target.value);
                if (error) setError('');
              }}
              placeholder="回答内容を入力してください..."
              rows={5}
              disabled={submitting}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送信中...' : '回答を送信'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">まだ回答はありません。</p>
        )}
      </CardContent>
    </Card>
  );
}

interface ConvertToQaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  categories: QaCategory[];
  onConvert: (data: {
    categoryId: number;
    itemTitle: string;
    itemIsPublic: boolean;
  }) => Promise<void>;
}

function ConvertToQaDialog({
  open,
  onOpenChange,
  defaultTitle,
  categories,
  onConvert,
}: ConvertToQaDialogProps) {
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState(defaultTitle);
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ categoryId?: string; title?: string }>({});

  const validate = () => {
    const newErrors: { categoryId?: string; title?: string } = {};
    if (!categoryId) newErrors.categoryId = 'カテゴリを選択してください';
    if (!title.trim()) newErrors.title = 'タイトルは必須です';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onConvert({
        categoryId: Number(categoryId),
        itemTitle: title.trim(),
        itemIsPublic: isPublic,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QAに変換</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Category */}
          <div className="space-y-1.5">
            <Label>
              カテゴリ <span className="text-destructive">*</span>
            </Label>
            <Select
              value={categoryId || undefined}
              onValueChange={(v) => {
                setCategoryId(v);
                if (errors.categoryId) setErrors((prev) => ({ ...prev, categoryId: undefined }));
              }}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="カテゴリを選択" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.categoryName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryId && (
              <p className="text-xs text-destructive">{errors.categoryId}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              disabled={submitting}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          {/* Public flag */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="isPublic"
              checked={isPublic}
              onCheckedChange={(checked) => setIsPublic(Boolean(checked))}
              disabled={submitting}
            />
            <Label htmlFor="isPublic" className="cursor-pointer font-normal">
              公開する
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '変換中...' : 'QAに変換'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Main component ---

interface Props {
  id: string;
}

export function InquiryDetailClient({ id }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, hasRole, isAdmin } = useAuth();

  const isInternalUser = hasRole(['admin', 'staff']);

  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingInProgress, setDeletingInProgress] = useState(false);

  const {
    data: inquiry,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inquiry', id],
    queryFn: () => fetchInquiry(id),
  });

  const { data: categories } = useQuery({
    queryKey: ['qa-categories'],
    queryFn: fetchQaCategories,
    enabled: isInternalUser,
  });

  const invalidateInquiry = () => {
    queryClient.invalidateQueries({ queryKey: ['inquiry', id] });
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'inquiries' });
  };

  // --- Mutation handlers ---

  const handlePatch = async (data: Record<string, unknown>) => {
    const res = await fetch(`/api/v1/inquiries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json?.error?.message ?? '更新に失敗しました');
    }
    return res.json();
  };

  const handleAssignUser = async (userId: string) => {
    try {
      await handlePatch({ inquiryAssignedUserId: userId ? Number(userId) : null });
      toast({ message: '担当者を更新しました', type: 'success' });
      invalidateInquiry();
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : '担当者の更新に失敗しました',
        type: 'error',
      });
    }
  };

  const handleStatusChange = async (status: string) => {
    try {
      await handlePatch({ inquiryStatus: status });
      toast({ message: 'ステータスを更新しました', type: 'success' });
      invalidateInquiry();
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : 'ステータスの更新に失敗しました',
        type: 'error',
      });
    }
  };

  const handleRespond = async (responseText: string) => {
    const res = await fetch(`/api/v1/inquiries/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiryResponse: responseText }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json?.error?.message ?? '回答の送信に失敗しました');
    }
    toast({ message: '回答を送信しました', type: 'success' });
    invalidateInquiry();
  };

  const handleConvertToQa = async (data: {
    categoryId: number;
    itemTitle: string;
    itemIsPublic: boolean;
  }) => {
    const res = await fetch(`/api/v1/inquiries/${id}/convert-to-qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json?.error?.message ?? 'QA変換に失敗しました');
    }
    toast({ message: 'QAに変換しました', type: 'success' });
    invalidateInquiry();
  };

  const handleDelete = async () => {
    setDeletingInProgress(true);
    try {
      const res = await fetch(`/api/v1/inquiries/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error?.message ?? '削除に失敗しました');
      }
      toast({ message: '問い合わせを削除しました', type: 'success' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'inquiries' });
      router.push('/inquiries');
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : '削除に失敗しました',
        type: 'error',
      });
      setDeletingInProgress(false);
      setDeleteConfirmOpen(false);
    }
  };

  // --- Render ---

  if (isLoading) {
    return <InquiryDetailSkeleton />;
  }

  if (error || !inquiry) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="問い合わせ詳細"
          breadcrumbs={[
            { label: '問い合わせ一覧', href: '/inquiries' },
            { label: '詳細' },
          ]}
        />
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
          問い合わせの取得に失敗しました。存在しないか、アクセス権がありません。
        </div>
      </div>
    );
  }

  const canConvertToQa =
    isInternalUser &&
    !inquiry.inquiryIsConvertedToQa &&
    (inquiry.inquiryStatus === 'resolved' || inquiry.inquiryStatus === 'in_progress');

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={inquiry.inquirySubject}
        breadcrumbs={[
          { label: '問い合わせ一覧', href: '/inquiries' },
          { label: inquiry.inquirySubject },
        ]}
        actions={
          isAdmin ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              削除
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content — left 2/3 */}
        <div className="space-y-6 lg:col-span-2">
          {/* Meta info strip */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <InquiryStatusBadge status={inquiry.inquiryStatus} size="lg" />

            {inquiry.business && (
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                {inquiry.business.businessName}
              </span>
            )}

            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              起票者: {inquiry.creator.userName}
            </span>

            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              起票日: {formatDate(inquiry.createdAt)}
            </span>

            {inquiry.category && (
              <Badge variant="secondary">{inquiry.category.categoryName}</Badge>
            )}

            {inquiry.project && (
              <span className="flex items-center gap-1 text-blue-600 hover:underline cursor-pointer">
                <ArrowRight className="h-3.5 w-3.5" />
                関連案件: {inquiry.project.projectName}
              </span>
            )}
          </div>

          <Separator />

          {/* Inquiry body */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                問い合わせ内容
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {inquiry.inquiryBody}
              </p>
            </CardContent>
          </Card>

          {/* Response section */}
          <ResponseSection
            inquiry={inquiry}
            isInternalUser={isInternalUser}
            onRespond={handleRespond}
          />

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Paperclip className="h-4 w-4" />
                添付ファイル
                {inquiry.attachments.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {inquiry.attachments.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inquiry.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">添付ファイルはありません。</p>
              ) : (
                <ul className="space-y-2">
                  {inquiry.attachments.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate">{att.fileName}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          ({formatFileSize(att.fileSize)})
                        </span>
                      </span>
                      <a
                        href={att.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-3 flex-shrink-0 text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ダウンロード
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Converted QA info */}
          {inquiry.inquiryIsConvertedToQa && inquiry.convertedQa && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-purple-800 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  このお問い合わせはQAに変換されました
                </p>
                <p className="text-sm text-purple-700 mt-1">
                  QAタイトル: {inquiry.convertedQa.itemTitle}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar — right 1/3 (admin/staff only) */}
        {isInternalUser && (
          <div className="space-y-4">
            {/* Assign user */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">担当者</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={inquiry.inquiryAssignedUserId ? String(inquiry.inquiryAssignedUserId) : 'unassigned'}
                  onValueChange={(v) => handleAssignUser(v === 'unassigned' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="担当者を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">未アサイン</SelectItem>
                    {/* Current user option — minimal approach as user list API is not specified */}
                    {user && (
                      <SelectItem value={String(user.id)}>
                        {user.name}（自分）
                      </SelectItem>
                    )}
                    {inquiry.assignedUser && inquiry.assignedUser.id !== user?.id && (
                      <SelectItem value={String(inquiry.assignedUser.id)}>
                        {inquiry.assignedUser.userName}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">ステータス変更</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={inquiry.inquiryStatus}
                  onValueChange={handleStatusChange}
                  disabled={inquiry.inquiryStatus === 'converted_to_qa'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">新規</SelectItem>
                    <SelectItem value="in_progress">対応中</SelectItem>
                    <SelectItem value="resolved">解決済み</SelectItem>
                    <SelectItem value="converted_to_qa" disabled>
                      QA変換済
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Convert to QA */}
            {canConvertToQa && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">QA変換</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setConvertDialogOpen(true)}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    QAに変換する
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Meta info card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">詳細情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>作成日時</span>
                  <span>{formatDateTime(inquiry.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>更新日時</span>
                  <span>{formatDateTime(inquiry.updatedAt)}</span>
                </div>
                {inquiry.inquiryResponse && inquiry.inquiryRespondedAt && (
                  <div className="flex justify-between">
                    <span>回答日時</span>
                    <span>{formatDateTime(inquiry.inquiryRespondedAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {isInternalUser && (
        <ConvertToQaDialog
          open={convertDialogOpen}
          onOpenChange={setConvertDialogOpen}
          defaultTitle={inquiry.inquirySubject}
          categories={categories ?? []}
          onConvert={handleConvertToQa}
        />
      )}

      <ConfirmModal
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="問い合わせを削除"
        description={`「${inquiry.inquirySubject}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deletingInProgress}
      />
    </div>
  );
}

function InquiryDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-96" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-28" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
