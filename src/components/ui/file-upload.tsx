'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, FileText, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================
// 汎用ファイルアップロードコンポーネント
// PDF等のドキュメント対応
// ドラッグ&ドロップ + クリックでファイル選択
// ============================================

interface FileUploadProps {
  /** 現在のファイル URL（null = 未設定） */
  value: string | null;
  /** アップロード済みの URL と key を受け取るコールバック */
  onUpload: (file: File) => Promise<{ url: string; key: string } | null>;
  /** 削除時に呼ばれるコールバック */
  onDelete: (key?: string) => void;
  /** 現在のファイルキー（削除 API 呼び出しに使用） */
  fileKey?: string | null;
  /** アップロード中か */
  isUploading?: boolean;
  /** フォームの label htmlFor と紐づける id */
  id?: string;
  /** ラベル */
  label?: string;
  /** 追加の CSS クラス */
  className?: string;
  /** input の accept 属性 */
  accept?: string;
  /** 説明テキスト */
  description?: string;
}

export function FileUpload({
  value,
  onUpload,
  onDelete,
  fileKey,
  isUploading,
  id,
  label,
  className,
  accept = 'application/pdf',
  description = 'PDF, 5MB以内',
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = useCallback(
    async (file: File) => {
      await onUpload(file);
    },
    [onUpload],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  // ============================================
  // ファイルあり表示
  // ============================================

  if (value) {
    const filename = value.split('/').pop() ?? 'ファイル';

    return (
      <div className={cn('relative', className)}>
        {label && <p className="text-sm font-medium mb-1 text-muted-foreground">{label}</p>}
        <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
          <FileText className="h-8 w-8 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{filename}</p>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              開く <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onDelete(fileKey ?? undefined)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ============================================
  // ドロップゾーン（ファイルなし）
  // ============================================

  return (
    <div className={cn('relative', className)}>
      {label && <p className="text-sm font-medium mb-1 text-muted-foreground">{label}</p>}
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-6 cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30',
          isUploading && 'pointer-events-none opacity-60',
        )}
        onClick={() => !isUploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin mb-1" />
            <p className="text-xs text-muted-foreground">アップロード中...</p>
          </>
        ) : (
          <>
            {isDragging ? (
              <FileText className="h-6 w-6 text-primary mb-1" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground mb-1" />
            )}
            <p className="text-xs text-muted-foreground text-center px-2">
              クリックまたはドラッグ&ドロップ
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{description}</p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
