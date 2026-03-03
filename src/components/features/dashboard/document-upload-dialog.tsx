'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X, File as FileIcon, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { BusinessDocument, DocumentType } from '@/types/business-document';

// ============================================
// 定数
// ============================================

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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
  'image/webp',
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
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `このファイル形式（${file.type || '不明'}）はアップロードできません`;
  }
  return null;
}

// ============================================
// Props
// ============================================

export interface DocumentUploadDialogProps {
  businessId: number;
  documentType: DocumentType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** 編集モード時に既存ドキュメントを渡す */
  editingDocument?: BusinessDocument | null;
}

// ============================================
// コンポーネント
// ============================================

export function DocumentUploadDialog({
  businessId,
  documentType,
  open,
  onOpenChange,
  onSuccess,
  editingDocument = null,
}: DocumentUploadDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editingDocument;
  const isInvoice = documentType === 'invoice';

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 編集モードの初期値セット
  useEffect(() => {
    if (open && editingDocument) {
      setDocumentTitle(editingDocument.documentTitle);
      setTargetMonth(editingDocument.targetMonth ?? '');
      setDescription(editingDocument.documentDescription ?? '');
      setIsPublic(editingDocument.isPublic);
      setSelectedFile(null);
      setValidationError(null);
    }
  }, [open, editingDocument]);

  const dialogTitle = isEditing
    ? (isInvoice ? '支払明細書を編集' : '資料を編集')
    : (isInvoice ? '支払明細書をアップロード' : '資料をアップロード');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const resetState = () => {
    setSelectedFile(null);
    setDocumentTitle('');
    setTargetMonth('');
    setDescription('');
    setIsPublic(true);
    setIsDragging(false);
    setValidationError(null);
  };

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

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

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setValidationError(null);
  };

  // 新規作成時はファイル必須、編集時はファイル任意
  const canSubmit =
    !validationError &&
    !isSubmitting &&
    documentTitle.trim() &&
    (!isInvoice || targetMonth) &&
    (isEditing || selectedFile);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('documentTitle', documentTitle.trim());
      formData.append('isPublic', String(isPublic));
      if (isInvoice && targetMonth) {
        formData.append('targetMonth', targetMonth);
      }
      if (description.trim()) {
        formData.append('documentDescription', description.trim());
      }

      let url: string;
      let method: string;

      if (isEditing) {
        url = `/api/v1/businesses/${businessId}/documents/${editingDocument.id}`;
        method = 'PUT';
        if (selectedFile) {
          formData.append('file', selectedFile);
        }
      } else {
        url = `/api/v1/businesses/${businessId}/documents`;
        method = 'POST';
        formData.append('documentType', documentType);
        formData.append('file', selectedFile!);
      }

      const response = await fetch(url, { method, body: formData });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(err.error?.message ?? (isEditing ? '更新に失敗しました' : 'アップロードに失敗しました'));
      }

      toast({
        message: isEditing ? '更新しました' : 'アップロードしました',
        type: 'success',
      });
      resetState();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : (isEditing ? '更新に失敗しました' : 'アップロードに失敗しました');
      toast({ message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* タイトル（必須） */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">タイトル</Label>
            <Input
              id="doc-title"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              placeholder={isInvoice ? '例: 2026年2月 支払明細書' : '例: 営業マニュアル'}
            />
          </div>

          {/* 対象年月（支払明細書のみ・必須） */}
          {isInvoice && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-target-month">対象年月</Label>
              <Input
                id="doc-target-month"
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
              />
            </div>
          )}

          {/* 公開トグル */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="doc-is-public"
              checked={isPublic}
              onCheckedChange={(checked) => setIsPublic(checked === true)}
            />
            <Label htmlFor="doc-is-public" className="text-sm font-normal cursor-pointer">
              代理店に公開する
            </Label>
          </div>

          {/* ファイル選択 */}
          {isEditing && !selectedFile && (
            <div className="space-y-1.5">
              <Label>現在のファイル</Label>
              <div className="flex items-center gap-3 rounded-lg border px-4 py-3 bg-muted/30">
                <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="text-sm truncate flex-1">{editingDocument.fileName}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  変更
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                onChange={handleInputChange}
                accept={ALLOWED_MIME_TYPES.join(',')}
              />
            </div>
          )}

          {(!isEditing || selectedFile) && (
            <>
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
                    'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors',
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50',
                  )}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      クリックまたはドラッグ&ドロップ
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, Word, Excel, 画像, CSV, ZIP（最大 10 MB）
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
                <div className="flex items-center gap-3 rounded-lg border px-4 py-3 bg-muted/30">
                  <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {isEditing ? '新しいファイル: ' : ''}{selectedFile.name}
                    </p>
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
            </>
          )}

          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}

          {/* 説明（任意） */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-description">説明（任意）</Label>
            <Textarea
              id="doc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ファイルの説明を入力してください"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {isEditing ? '更新中...' : 'アップロード中...'}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {isEditing ? <Pencil className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                {isEditing ? '更新' : 'アップロード'}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
