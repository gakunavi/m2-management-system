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
  Bell,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useBusiness } from '@/hooks/use-business';
import { cn } from '@/lib/utils';
import { InvoiceUploadDialog } from './partner-invoice-upload-dialog';
import type { BusinessDocument } from '@/types/business-document';

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

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const base = cn('h-4 w-4 shrink-0', className);
  if (mimeType === 'application/pdf') return <FileText className={cn(base, 'text-red-500')} />;
  if (mimeType.includes('word')) return <FileText className={cn(base, 'text-blue-600')} />;
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType === 'text/csv')
    return <FileSpreadsheet className={cn(base, 'text-green-600')} />;
  if (mimeType.startsWith('image/')) return <ImageIcon className={cn(base, 'text-purple-500')} />;
  if (mimeType.includes('zip')) return <Archive className={cn(base, 'text-yellow-600')} />;
  return <File className={cn(base, 'text-muted-foreground')} />;
}

// ============================================
// Props
// ============================================

interface Props {
  entityId: number;
}

// ============================================
// コンポーネント
// ============================================

export function PartnerInvoicesTab({ entityId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { businesses } = useBusiness();

  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<BusinessDocument | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<BusinessDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notifyingId, setNotifyingId] = useState<number | null>(null);

  // API URL 構築
  const buildApiUrl = () => {
    let url = `/partners/${entityId}/documents?`;
    if (selectedBusinessId !== 'all') url += `businessId=${selectedBusinessId}&`;
    if (monthFilter !== 'all') url += `targetMonth=${monthFilter}&`;
    return url.replace(/[&?]$/, '');
  };

  const queryKey = ['partner-invoices', entityId, selectedBusinessId, monthFilter];

  const { data: documents = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/v1${buildApiUrl()}`);
      if (!res.ok) throw new Error('取得に失敗しました');
      const json = await res.json();
      return json.data as BusinessDocument[];
    },
  });

  const invalidateDocuments = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === 'partner-invoices' && key[1] === entityId;
      },
    });
  };

  const handleDelete = async () => {
    if (!deletingDoc) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/v1/partners/${entityId}/documents/${deletingDoc.id}`,
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

  const handleOpenFile = (doc: BusinessDocument) => {
    window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
  };

  // 通知送信
  const handleNotify = async (doc: BusinessDocument) => {
    setNotifyingId(doc.id);
    try {
      const response = await fetch(
        `/api/v1/businesses/${doc.businessId}/documents/${doc.id}/notify`,
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

  return (
    <div className="space-y-4 p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* 事業フィルタ */}
          <Select value={selectedBusinessId} onValueChange={setSelectedBusinessId}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="事業を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての事業</SelectItem>
              {businesses.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 月フィルタ */}
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
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
        </div>

        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1" />
          アップロード
        </Button>
      </div>

      {/* テーブル */}
      {isLoading ? (
        <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      ) : documents.length === 0 ? (
        <div className="h-32 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
          <FolderOpen className="h-8 w-8" />
          <p>支払明細書がありません</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">タイトル</TableHead>
                <TableHead className="w-[120px]">事業</TableHead>
                <TableHead className="min-w-[140px]">ファイル名</TableHead>
                <TableHead className="w-[80px]">サイズ</TableHead>
                <TableHead className="w-[100px]">対象年月</TableHead>
                <TableHead className="w-[100px]">アップロード日</TableHead>
                <TableHead className="w-[120px]">通知</TableHead>
                <TableHead className="w-[100px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
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
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {(doc as BusinessDocument & { business?: { businessName: string } }).business?.businessName ?? '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
                      {doc.fileName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatFileSize(doc.fileSize)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {doc.targetMonth ? formatTargetMonth(doc.targetMonth) : '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(doc.createdAt)}
                    </span>
                  </TableCell>
                  {/* 通知 */}
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
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
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
                      <button
                        type="button"
                        onClick={() => setEditingDoc(doc)}
                        className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-muted transition-colors"
                        aria-label="編集"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingDoc(doc)}
                        className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-destructive/10 transition-colors"
                        aria-label="削除"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 新規アップロードダイアログ */}
      <InvoiceUploadDialog
        partnerId={entityId}
        businesses={businesses}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={invalidateDocuments}
      />

      {/* 編集ダイアログ */}
      {editingDoc && (
        <InvoiceUploadDialog
          partnerId={entityId}
          businesses={businesses}
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
      <ConfirmModal
        open={deletingDoc !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingDoc(null);
        }}
        title="支払明細書を削除しますか？"
        description={
          deletingDoc
            ? `「${deletingDoc.documentTitle}」を削除します。この操作は元に戻せません。`
            : 'この支払明細書を削除します。この操作は元に戻せません。'
        }
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
