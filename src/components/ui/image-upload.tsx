'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================
// 汎用画像アップロードコンポーネント
// ドラッグ&ドロップ + クリックでファイル選択
// 状態: 空 → アップロード中 → プレビュー表示
// ============================================

interface ImageUploadProps {
  /** 現在の画像 URL（null = 未設定） */
  value: string | null;
  /** アップロード済みの URL と key を受け取るコールバック */
  onUpload: (file: File) => Promise<{ url: string; key: string } | null>;
  /** 削除時に呼ばれるコールバック。key を渡すと API 削除も行う */
  onDelete: (key?: string) => void;
  /** 現在のファイルキー（削除 API 呼び出しに使用） */
  fileKey?: string | null;
  /** アップロード中か */
  isUploading?: boolean;
  /** ラベル */
  label?: string;
  /** 追加の CSS クラス */
  className?: string;
  /** input の accept 属性 */
  accept?: string;
}

export function ImageUpload({
  value,
  onUpload,
  onDelete,
  fileKey,
  isUploading,
  label,
  className,
  accept = 'image/jpeg,image/png,image/webp',
}: ImageUploadProps) {
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
    // 同じファイルを再選択できるようリセット
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
  // プレビュー表示（画像あり）
  // ============================================

  if (value) {
    return (
      <div className={cn('relative', className)}>
        {label && <p className="text-sm font-medium mb-1 text-muted-foreground">{label}</p>}
        <div className="relative group rounded-lg border overflow-hidden bg-muted/30 aspect-[1.75/1]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label ?? '名刺画像'}
            className="w-full h-full object-contain"
          />
          {/* 削除ボタン（ホバーで表示） */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(fileKey ?? undefined)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // ============================================
  // ドロップゾーン（画像なし）
  // ============================================

  return (
    <div className={cn('relative', className)}>
      {label && <p className="text-sm font-medium mb-1 text-muted-foreground">{label}</p>}
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed aspect-[1.75/1] cursor-pointer transition-colors',
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
              <ImageIcon className="h-6 w-6 text-primary mb-1" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground mb-1" />
            )}
            <p className="text-xs text-muted-foreground text-center px-2">
              クリックまたはドラッグ&ドロップ
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">JPEG / PNG / WebP, 5MB以内</p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
