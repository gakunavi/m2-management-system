'use client';

import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ============================================
// 画像拡大プレビューモーダル
// 複数画像の場合は矢印で切替可能
// ============================================

export interface PreviewImage {
  url: string;
  label?: string;
}

interface ImagePreviewModalProps {
  images: PreviewImage[];
  /** 初期表示インデックス */
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

export function ImagePreviewModal({
  images,
  initialIndex = 0,
  open,
  onClose,
}: ImagePreviewModalProps) {
  const [current, setCurrent] = useState(initialIndex);

  // モーダルが開くたびに initialIndex にリセット
  useEffect(() => {
    if (open) setCurrent(initialIndex);
  }, [open, initialIndex]);

  const hasPrev = current > 0;
  const hasNext = current < images.length - 1;
  const image = images[current];

  const handlePrev = () => {
    if (hasPrev) setCurrent((c) => c - 1);
  };
  const handleNext = () => {
    if (hasNext) setCurrent((c) => c + 1);
  };

  // キーボード操作
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current]);

  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black/95 border-border/20">
        {/* アクセシビリティ用非表示タイトル */}
        <DialogTitle className="sr-only">
          {image.label ?? '画像プレビュー'}
          {images.length > 1 ? ` (${current + 1}/${images.length})` : ''}
        </DialogTitle>

        {/* 閉じるボタン */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 text-white hover:bg-white/20"
          onClick={onClose}
          aria-label="閉じる"
        >
          <X className="h-5 w-5" />
        </Button>

        {/* ラベル + カウンター */}
        {(image.label || images.length > 1) && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
            {image.label && (
              <span className="text-sm text-white bg-black/50 px-2 py-0.5 rounded">
                {image.label}
              </span>
            )}
            {images.length > 1 && (
              <span className="text-sm text-white/60">
                {current + 1} / {images.length}
              </span>
            )}
          </div>
        )}

        {/* 画像エリア */}
        <div className="flex items-center justify-center min-h-[300px] max-h-[80vh] p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.label ?? '画像'}
            className="max-w-full max-h-[70vh] object-contain rounded"
          />
        </div>

        {/* 前後ナビ */}
        {images.length > 1 && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 disabled:opacity-30"
              onClick={handlePrev}
              disabled={!hasPrev}
              aria-label="前の画像"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 disabled:opacity-30"
              onClick={handleNext}
              disabled={!hasNext}
              aria-label="次の画像"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* ドットナビゲーター（複数画像時） */}
        {images.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-3">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`画像 ${i + 1}`}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === current ? 'bg-white' : 'bg-white/30 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
