'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

// ============================================
// ファイルアップロード/削除フック
// ============================================

interface UseFileUploadOptions {
  /** 保存先ディレクトリ（例: 'business-cards'） */
  directory: string;
  /** 最大ファイルサイズ (MB)。デフォルト 5MB */
  maxSizeMB?: number;
  /** 許可する MIME タイプ。デフォルト JPEG/PNG/WebP */
  acceptTypes?: string[];
}

export interface UploadedFile {
  key: string;
  url: string;
  filename: string;
  size: number;
  contentType: string;
}

export function useFileUpload(options: UseFileUploadOptions) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const maxSize = (options.maxSizeMB ?? 5) * 1024 * 1024;
  const acceptTypes = options.acceptTypes ?? ['image/jpeg', 'image/png', 'image/webp'];

  const upload = useCallback(
    async (file: File): Promise<UploadedFile | null> => {
      // クライアントサイドバリデーション
      if (!acceptTypes.includes(file.type)) {
        const typeLabels: Record<string, string> = {
          'image/jpeg': 'JPEG',
          'image/png': 'PNG',
          'image/webp': 'WebP',
          'application/pdf': 'PDF',
        };
        const allowed = acceptTypes.map((t) => typeLabels[t] ?? t).join('、');
        toast({ message: `${allowed} 形式のみアップロードできます`, type: 'error' });
        return null;
      }
      if (file.size > maxSize) {
        toast({
          message: `ファイルサイズが上限（${options.maxSizeMB ?? 5}MB）を超えています`,
          type: 'error',
        });
        return null;
      }

      setIsUploading(true);
      try {
        const result = await apiClient.uploadFile(file, options.directory);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'アップロードに失敗しました';
        toast({ message, type: 'error' });
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [options.directory, options.maxSizeMB, maxSize, acceptTypes, toast],
  );

  const remove = useCallback(
    async (key: string): Promise<boolean> => {
      setIsDeleting(true);
      try {
        await apiClient.deleteFile(key);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ファイルの削除に失敗しました';
        toast({ message, type: 'error' });
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [toast],
  );

  return { upload, remove, isUploading, isDeleting };
}
