'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, File as FileIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { FileCategory } from '@/types/project-file';
import { cn } from '@/lib/utils';

// ============================================
// 定数
// ============================================

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES: string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
];

// ============================================
// ヘルパー
// ============================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `ファイルサイズが上限（10 MB）を超えています（${formatFileSize(file.size)}）`;
  }
  if (ALLOWED_MIME_TYPES.length > 0 && !ALLOWED_MIME_TYPES.includes(file.type)) {
    return `このファイル形式（${file.type || '不明'}）はアップロードできません`;
  }
  return null;
}

// ============================================
// Props
// ============================================

export interface FileUploadDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  fileCategories?: FileCategory[];
}

// ============================================
// コンポーネント
// ============================================

export function FileUploadDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
  fileCategories = [],
}: FileUploadDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ダイアログを閉じる際に状態をリセット
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isUploading) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const resetState = () => {
    setSelectedFile(null);
    setCategory('');
    setDescription('');
    setIsDragging(false);
    setValidationError(null);
  };

  // ファイル選択処理（共通）
  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setValidationError(error);
      setSelectedFile(null);
      return;
    }
    setValidationError(null);
    setSelectedFile(file);
  };

  // ファイル input onChange
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // 同じファイルを再選択できるようにリセット
    e.target.value = '';
  };

  // ドラッグ&ドロップ
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ファイルを削除（選択解除）
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setValidationError(null);
  };

  // アップロード実行
  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (category) formData.append('category', category);
      if (description.trim()) formData.append('description', description.trim());

      const response = await fetch(`/api/v1/projects/${projectId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as {
          error?: { message?: string };
        };
        throw new Error(err.error?.message ?? 'アップロードに失敗しました');
      }

      toast({ message: 'ファイルをアップロードしました', type: 'success' });
      resetState();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'アップロードに失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ファイルをアップロード</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ドラッグ&ドロップエリア */}
          {!selectedFile ? (
            <div
              role="button"
              tabIndex={0}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  fileInputRef.current?.click();
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50',
              )}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  クリックまたはドラッグ&ドロップでファイルを選択
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, Word, Excel, 画像, ZIP など（最大 10 MB）
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                onChange={handleInputChange}
                accept={ALLOWED_MIME_TYPES.join(',')}
              />
            </div>
          ) : (
            /* 選択済みファイル表示 */
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3 bg-muted/30">
              <FileIcon className="h-8 w-8 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
              </div>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="shrink-0 rounded p-1 hover:bg-muted transition-colors"
                aria-label="ファイルを削除"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* バリデーションエラー */}
          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}

          {/* カテゴリ選択（任意） */}
          {fileCategories.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="file-category">カテゴリ（任意）</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="file-category">
                  <SelectValue placeholder="カテゴリを選択" />
                </SelectTrigger>
                <SelectContent>
                  {fileCategories
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((cat) => (
                      <SelectItem key={cat.key} value={cat.key}>
                        {cat.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 説明（任意） */}
          <div className="space-y-1.5">
            <Label htmlFor="file-description">説明（任意）</Label>
            <Textarea
              id="file-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ファイルの説明を入力してください"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isUploading}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !!validationError || isUploading}
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                アップロード中...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                アップロード
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
