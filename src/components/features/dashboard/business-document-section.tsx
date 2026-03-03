'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  File,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  Archive,
  Upload,
  Trash2,
  Download,
  Pencil,
  FolderOpen,
  Calendar,
  Eye,
  EyeOff,
  Bell,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { DocumentUploadDialog } from './document-upload-dialog';
import type { BusinessDocument, DocumentType } from '@/types/business-document';

// ============================================
// ヘルパー
// ============================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTargetMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

function generateMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 6; i >= -12; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    options.push({ value, label });
  }
  return options;
}

// ============================================
// ファイルアイコン
// ============================================

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const base = cn('h-4 w-4 shrink-0', className);

  if (mimeType === 'application/pdf') {
    return <FileText className={cn(base, 'text-red-500')} />;
  }
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return <FileText className={cn(base, 'text-blue-600')} />;
  }
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'text/csv'
  ) {
    return <FileSpreadsheet className={cn(base, 'text-green-600')} />;
  }
  if (mimeType.startsWith('image/')) {
    return <ImageIcon className={cn(base, 'text-purple-500')} />;
  }
  if (mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') {
    return <Archive className={cn(base, 'text-yellow-600')} />;
  }
  return <File className={cn(base, 'text-muted-foreground')} />;
}

// ============================================
// Props
// ============================================

interface BusinessDocumentSectionProps {
  businessId: number;
  documentType: DocumentType;
  title: string;
  canManage?: boolean;
  apiBase?: '/businesses' | '/portal';
}

// ============================================
// コンポーネント
// ============================================

export function BusinessDocumentSection({
  businessId,
  documentType,
  title,
  canManage = false,
  apiBase = '/businesses',
}: BusinessDocumentSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<BusinessDocument | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<BusinessDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [notifyingId, setNotifyingId] = useState<number | null>(null);

  const isInvoice = documentType === 'invoice';

  // API URL を構築
  const buildApiUrl = () => {
    const monthParam = isInvoice && monthFilter !== 'all' ? `&targetMonth=${monthFilter}` : '';
    if (apiBase === '/portal') {
      return `/portal/documents?businessId=${businessId}&type=${documentType}${monthParam}`;
    }
    return `/businesses/${businessId}/documents?type=${documentType}${monthParam}`;
  };

  const queryKey = ['business-documents', businessId, documentType, monthFilter];

  const { data: documents = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<BusinessDocument[]>(buildApiUrl()),
  });

  const invalidateDocuments = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key[0] === 'business-documents' &&
          key[1] === businessId &&
          key[2] === documentType
        );
      },
    });
  };

  // 公開状態トグル
  const handleTogglePublic = async (doc: BusinessDocument) => {
    setTogglingId(doc.id);
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/documents/${doc.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: !doc.isPublic }),
        },
      );
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(err.error?.message ?? '更新に失敗しました');
      }
      toast({
        message: doc.isPublic ? '非公開にしました' : '公開しました',
        type: 'success',
      });
      invalidateDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setTogglingId(null);
    }
  };

  // 削除
  const handleDelete = async () => {
    if (!deletingDoc) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/documents/${deletingDoc.id}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(err.error?.message ?? '削除に失敗しました');
      }
      toast({ message: '削除しました', type: 'success' });
      setDeletingDoc(null);
      invalidateDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : '削除に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // タイトルクリック → ブラウザで開く
  const handleOpenFile = (doc: BusinessDocument) => {
    window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
  };

  // 通知送信
  const handleNotify = async (doc: BusinessDocument) => {
    setNotifyingId(doc.id);
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessId}/documents/${doc.id}/notify`,
        { method: 'POST' },
      );
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(err.error?.message ?? '通知送信に失敗しました');
      }
      const json = await response.json();
      const count = json.data?.recipientCount ?? 0;
      toast({
        message: `${count}件の通知を送信しました`,
        type: 'success',
      });
      invalidateDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : '通知送信に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setNotifyingId(null);
    }
  };

  const monthOptions = generateMonthOptions();

  // ============================================
  // ローディング状態
  // ============================================

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">{title}</h3>
        <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  // ============================================
  // メインレンダリング
  // ============================================

  return (
    <div className="rounded-lg border bg-card p-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          {/* 月フィルタ（支払明細書のみ） */}
          {isInvoice && (
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <Calendar className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="すべて" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              追加
            </Button>
          )}
        </div>
      </div>

      {/* ドキュメント一覧 */}
      {documents.length === 0 ? (
        <div className="h-32 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
          <FolderOpen className="h-8 w-8" />
          <p>{isInvoice ? '支払明細書がありません' : '資料がありません'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">タイトル</TableHead>
                <TableHead className="min-w-[140px]">ファイル名</TableHead>
                <TableHead className="w-[80px]">サイズ</TableHead>
                {isInvoice && <TableHead className="w-[100px]">対象年月</TableHead>}
                <TableHead className="w-[100px]">アップロード日</TableHead>
                {canManage && <TableHead className="w-[80px]">公開状態</TableHead>}
                {canManage && <TableHead className="w-[120px]">通知</TableHead>}
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  {/* タイトル（クリックでブラウザ表示） */}
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleOpenFile(doc)}
                      className="flex items-center gap-2 text-left text-sm font-medium text-primary hover:underline cursor-pointer"
                    >
                      <FileTypeIcon mimeType={doc.fileMimeType} />
                      <span className="truncate">{doc.documentTitle}</span>
                    </button>
                  </TableCell>

                  {/* ファイル名 */}
                  <TableCell>
                    <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
                      {doc.fileName}
                    </span>
                  </TableCell>

                  {/* サイズ */}
                  <TableCell>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatFileSize(doc.fileSize)}
                    </span>
                  </TableCell>

                  {/* 対象年月（支払明細書のみ） */}
                  {isInvoice && (
                    <TableCell>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {doc.targetMonth ? formatTargetMonth(doc.targetMonth) : '-'}
                      </span>
                    </TableCell>
                  )}

                  {/* アップロード日 */}
                  <TableCell>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(doc.createdAt)}
                    </span>
                  </TableCell>

                  {/* 公開状態（管理者のみ表示） */}
                  {canManage && (
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleTogglePublic(doc)}
                        disabled={togglingId === doc.id}
                        className="cursor-pointer disabled:opacity-50"
                      >
                        {doc.isPublic ? (
                          <Badge variant="default" className="gap-1 text-xs">
                            <Eye className="h-3 w-3" />
                            公開
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <EyeOff className="h-3 w-3" />
                            非公開
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                  )}

                  {/* 通知（管理者のみ） */}
                  {canManage && (
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={notifyingId === doc.id}
                          onClick={() => handleNotify(doc)}
                        >
                          {notifyingId === doc.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Bell className="h-3 w-3" />
                          )}
                          {notifyingId === doc.id ? '送信中...' : '通知送信'}
                        </Button>
                        {doc.lastNotifiedAt && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            最終: {formatDateTime(doc.lastNotifiedAt)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  )}

                  {/* 操作 */}
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {/* ダウンロード */}
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={doc.fileName}
                        className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-muted transition-colors"
                        aria-label="ダウンロード"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>

                      {canManage && (
                        <>
                          {/* 編集 */}
                          <button
                            type="button"
                            onClick={() => setEditingDoc(doc)}
                            className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-muted transition-colors"
                            aria-label="編集"
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </button>

                          {/* 削除 */}
                          <button
                            type="button"
                            onClick={() => setDeletingDoc(doc)}
                            className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-destructive/10 transition-colors"
                            aria-label="削除"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 新規アップロードダイアログ */}
      {canManage && (
        <DocumentUploadDialog
          businessId={businessId}
          documentType={documentType}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onSuccess={invalidateDocuments}
        />
      )}

      {/* 編集ダイアログ */}
      {canManage && editingDoc && (
        <DocumentUploadDialog
          businessId={businessId}
          documentType={documentType}
          open={editingDoc !== null}
          onOpenChange={(open) => {
            if (!open) setEditingDoc(null);
          }}
          onSuccess={() => {
            setEditingDoc(null);
            invalidateDocuments();
          }}
          editingDocument={editingDoc}
        />
      )}

      {/* 削除確認モーダル */}
      {canManage && (
        <ConfirmModal
          open={deletingDoc !== null}
          onOpenChange={(open) => {
            if (!open) setDeletingDoc(null);
          }}
          title="ドキュメントを削除しますか？"
          description={
            deletingDoc
              ? `「${deletingDoc.documentTitle}」を削除します。この操作は元に戻せません。`
              : 'このドキュメントを削除します。この操作は元に戻せません。'
          }
          confirmLabel="削除する"
          variant="destructive"
          onConfirm={handleDelete}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}
