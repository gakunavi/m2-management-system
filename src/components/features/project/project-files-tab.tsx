'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  File,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  Archive,
  Upload,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { FileUploadDialog } from '@/components/features/project/file-upload-dialog';
import type { ProjectFile, FileCategory } from '@/types/project-file';
import { cn } from '@/lib/utils';

// ============================================
// ヘルパー関数
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

// ============================================
// ファイルアイコン
// ============================================

interface FileIconProps {
  mimeType: string;
  className?: string;
}

function FileTypeIcon({ mimeType, className }: FileIconProps) {
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
// スケルトンローディング
// ============================================

function FilesTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {['ファイル名', 'カテゴリ', 'サイズ', 'アップロード日', 'アップロード者', '操作'].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============================================
// Props
// ============================================

interface FilesResponse {
  data: ProjectFile[];
  fileCategories: FileCategory[];
}

interface Props {
  entityId: number;
}

// ============================================
// メインコンポーネント
// ============================================

export function ProjectFilesTab({ entityId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingFile, setDeletingFile] = useState<ProjectFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('__all__');

  const {
    data: response,
    isLoading,
    error,
  } = useQuery<FilesResponse>({
    queryKey: ['project-files', entityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects/${entityId}/files`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? 'ファイルの取得に失敗しました');
      }
      const json = await res.json() as FilesResponse;
      return { data: json.data, fileCategories: json.fileCategories ?? [] };
    },
  });

  const files = useMemo(() => response?.data ?? [], [response]);
  const fileCategories = useMemo(() => response?.fileCategories ?? [], [response]);

  // ============================================
  // カテゴリフィルタ用の一覧（businessConfig + ファイルから動的生成）
  // ============================================

  const availableCategories = useMemo<FileCategory[]>(() => {
    // businessConfig のカテゴリをベースに
    if (fileCategories.length > 0) {
      return [...fileCategories].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    // businessConfig にカテゴリがない場合はファイルから動的生成
    const seen = new Set<string>();
    const categories: FileCategory[] = [];
    for (const f of files) {
      if (f.fileCategory && !seen.has(f.fileCategory)) {
        seen.add(f.fileCategory);
        categories.push({ key: f.fileCategory, label: f.fileCategory, sortOrder: categories.length });
      }
    }
    return categories.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [files, fileCategories]);

  // フィルタ済みファイル一覧
  const filteredFiles = useMemo(() => {
    if (categoryFilter === '__all__') return files;
    if (categoryFilter === '__none__') return files.filter((f) => !f.fileCategory);
    return files.filter((f) => f.fileCategory === categoryFilter);
  }, [files, categoryFilter]);

  // ============================================
  // キャッシュ無効化（アップロード・削除後）
  // ============================================

  const invalidateFiles = () => {
    queryClient.invalidateQueries({ queryKey: ['project-files', entityId] });
  };

  // ============================================
  // 削除処理
  // ============================================

  const handleDeleteConfirm = async () => {
    if (!deletingFile) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/projects/${entityId}/files/${deletingFile.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? 'ファイルの削除に失敗しました');
      }
      toast({ message: 'ファイルを削除しました', type: 'success' });
      setDeletingFile(null);
      invalidateFiles();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ファイルの削除に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // ============================================
  // ローディング / エラー状態
  // ============================================

  if (isLoading) return <FilesTableSkeleton />;

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-destructive">
        {(error as Error).message ?? 'ファイルの取得に失敗しました'}
      </div>
    );
  }

  // ============================================
  // レンダリング
  // ============================================

  const hasUncategorized = files.length > 0 && files.some((f) => !f.fileCategory);
  const showFilter = availableCategories.length > 0 && files.length > 0;

  return (
    <div className="space-y-4">
      {/* ヘッダー: フィルタ + アップロードボタン */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* カテゴリフィルタ */}
        {showFilter && (
          <div className="w-44">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="すべてのカテゴリ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">すべてのカテゴリ</SelectItem>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat.key} value={cat.key}>
                    {cat.label}
                  </SelectItem>
                ))}
                {hasUncategorized && (
                  <SelectItem value="__none__">未分類</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="ml-auto">
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            ファイルをアップロード
          </Button>
        </div>
      </div>

      {/* ファイル件数表示 */}
      {files.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {categoryFilter === '__all__'
            ? `${files.length} 件`
            : `${filteredFiles.length} 件（全 ${files.length} 件中）`}
        </p>
      )}

      {/* テーブル / 空状態 */}
      {files.length === 0 ? (
        <EmptyState
          title="ファイルが登録されていません"
          description="「ファイルをアップロード」ボタンからファイルを追加してください。"
          action={{
            label: 'ファイルをアップロード',
            onClick: () => setUploadOpen(true),
          }}
        />
      ) : filteredFiles.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          このカテゴリにはファイルがありません
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ファイル名</TableHead>
                <TableHead>カテゴリ</TableHead>
                <TableHead>サイズ</TableHead>
                <TableHead>アップロード日</TableHead>
                <TableHead>アップロード者</TableHead>
                <TableHead className="w-[60px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map((file) => (
                <TableRow key={file.id}>
                  {/* ファイル名（リンク付き） */}
                  <TableCell>
                    <a
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-medium hover:underline group max-w-xs"
                      title={file.fileName}
                    >
                      <FileTypeIcon mimeType={file.fileMimeType} />
                      <span className="truncate">{file.fileName}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    {file.fileDescription && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-xs pl-6">
                        {file.fileDescription}
                      </p>
                    )}
                  </TableCell>

                  {/* カテゴリ */}
                  <TableCell>
                    {file.fileCategory ? (
                      <Badge variant="secondary" className="text-xs">
                        {availableCategories.find((c) => c.key === file.fileCategory)?.label ?? file.fileCategory}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* サイズ */}
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatFileSize(file.fileSize)}
                  </TableCell>

                  {/* アップロード日 */}
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(file.createdAt)}
                  </TableCell>

                  {/* アップロード者 */}
                  <TableCell className="text-sm text-muted-foreground">
                    {file.creator?.userName ?? '-'}
                  </TableCell>

                  {/* 操作（削除） */}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-7 w-7 text-muted-foreground',
                        'hover:text-destructive hover:bg-destructive/10',
                      )}
                      onClick={() => setDeletingFile(file)}
                      aria-label="ファイルを削除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* アップロードダイアログ */}
      <FileUploadDialog
        projectId={entityId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={invalidateFiles}
        fileCategories={availableCategories}
      />

      {/* 削除確認モーダル */}
      <ConfirmModal
        open={deletingFile !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingFile(null);
        }}
        title="ファイルを削除しますか？"
        description={
          deletingFile
            ? `「${deletingFile.fileName}」を削除します。この操作は元に戻せません。`
            : 'このファイルを削除します。この操作は元に戻せません。'
        }
        confirmLabel="削除する"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  );
}
