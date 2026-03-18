'use client';

// NOTE: TaskAttachmentItem is defined here locally until it is added to @/types/task.
// Once the backend type is finalized, move this interface to src/types/task.ts and
// add `attachments: TaskAttachmentItem[]` to TaskDetail.

import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, ChevronDown, ChevronRight, X, File, FileText, FileSpreadsheet, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TaskAttachmentItem {
  id: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedByName: string;
  createdAt: string;
}

interface TaskAttachmentsProps {
  taskId: number;
  attachments: TaskAttachmentItem[];
  canDelete: boolean;
  onUpload: (file: File) => void;
  onDelete: (attachmentId: number) => void;
  isUploading?: boolean;
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return '1KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType === 'application/pdf') {
    return <FileText className={cn('text-red-500', className)} />;
  }
  if (
    mimeType.startsWith('application/vnd.openxmlformats') ||
    mimeType.startsWith('application/vnd.ms-excel') ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType.startsWith('application/vnd.ms-word')
  ) {
    return <FileSpreadsheet className={cn('text-green-600', className)} />;
  }
  return <File className={cn('text-muted-foreground', className)} />;
}

// ────────────────────────────────────────────────────────
// Image Preview Modal
// ────────────────────────────────────────────────────────

interface ImagePreviewModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

function ImagePreviewModal({ src, alt, onClose }: ImagePreviewModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20"
        aria-label="閉じる"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-full rounded shadow-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────

export function TaskAttachments({
  taskId,
  attachments,
  canDelete,
  onUpload,
  onDelete,
  isUploading = false,
}: TaskAttachmentsProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachmentItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // ── Clipboard paste (images only) ──────────────────────
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const files = Array.from(e.clipboardData.files).filter((f) =>
        f.type.startsWith('image/'),
      );
      files.forEach((file) => onUpload(file));
    },
    [onUpload],
  );

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // ── Drag & Drop ────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => onUpload(file));
  };

  // ── File picker ────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => onUpload(file));
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  // ── Download ───────────────────────────────────────────
  const getAttachmentUrl = (attachmentId: number) =>
    `/api/v1/tasks/${taskId}/attachments/${attachmentId}`;

  const handleDownload = (attachment: TaskAttachmentItem) => {
    const a = document.createElement('a');
    a.href = getAttachmentUrl(attachment.id);
    a.download = attachment.fileName;
    a.click();
  };

  return (
    <div className="rounded-lg border border-muted">
      {/* ── Section Header ── */}
      <button
        type="button"
        className="flex w-full items-center gap-1.5 p-3 text-left"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <Paperclip className="h-4 w-4 text-purple-500 flex-shrink-0" />
        <span className="text-sm font-medium">添付ファイル</span>
        {attachments.length > 0 && (
          <span className="text-xs text-muted-foreground">({attachments.length})</span>
        )}
        <span className="ml-auto text-muted-foreground">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* ── Body ── */}
      {isOpen && (
        <div className="border-t border-muted px-3 pb-3 pt-2 space-y-2">
          {/* Attachment grid */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="group relative"
                >
                  {isImageMime(att.mimeType) ? (
                    /* Image thumbnail */
                    <button
                      type="button"
                      onClick={() => setPreviewAttachment(att)}
                      className="block h-16 w-16 rounded border border-muted overflow-hidden bg-muted hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary"
                      title={att.fileName}
                      aria-label={`プレビュー: ${att.fileName}`}
                    >
                      <img
                        src={getAttachmentUrl(att.id)}
                        alt={att.fileName}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    /* Non-image file card */
                    <button
                      type="button"
                      onClick={() => handleDownload(att)}
                      className="flex h-16 w-28 flex-col items-center justify-center gap-1 rounded border border-muted bg-muted/50 px-1 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                      title={`ダウンロード: ${att.fileName}`}
                    >
                      <FileIcon mimeType={att.mimeType} className="h-6 w-6" />
                      <span className="w-full truncate text-center text-[10px] text-muted-foreground leading-tight px-1">
                        {att.fileName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatFileSize(att.fileSize)}
                      </span>
                    </button>
                  )}

                  {/* Delete button */}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`「${att.fileName}」を削除しますか？`)) {
                          onDelete(att.id);
                        }
                      }}
                      className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                      aria-label={`削除: ${att.fileName}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Drop zone */}
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'rounded-md border-2 border-dashed px-3 py-4 text-center transition-colors',
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50',
            )}
          >
            <p className="text-xs text-muted-foreground mb-2">
              ドロップまたは Ctrl+V で貼り付け
            </p>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={handleFileChange}
              aria-label="ファイルを選択"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted transition-colors',
                isUploading && 'cursor-not-allowed opacity-60',
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  アップロード中...
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  ファイルを追加
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Image preview modal */}
      {previewAttachment && isImageMime(previewAttachment.mimeType) && (
        <ImagePreviewModal
          src={getAttachmentUrl(previewAttachment.id)}
          alt={previewAttachment.fileName}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}
