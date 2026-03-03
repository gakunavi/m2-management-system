'use client';

import { useCallback } from 'react';
import { FileUpload } from '@/components/ui/file-upload';
import { useFileUpload } from '@/hooks/use-file-upload';
import type { FileUploadConfig } from '@/types/config';

// ============================================
// フォームフィールド用ファイルアップロード
// FileUpload UI + useFileUpload フック を統合
// ============================================

interface FileUploadFieldProps {
  value: string | null;
  onChange: (value: unknown) => void;
  config: FileUploadConfig;
  formData?: Record<string, unknown>;
  /** フォームの label htmlFor と紐づける id */
  id?: string;
  /** 他のフィールド（keyField）を更新するコールバック */
  onSetField?: (key: string, value: unknown) => void;
}

export function FileUploadField({
  value,
  onChange,
  config,
  formData,
  id,
  onSetField,
}: FileUploadFieldProps) {
  const { upload, remove, isUploading } = useFileUpload({
    directory: config.directory,
    acceptTypes: config.accept ? [config.accept] : undefined,
  });

  const currentKey = (formData?.[config.keyField] as string) ?? null;

  const handleUpload = useCallback(
    async (file: File) => {
      const result = await upload(file);
      if (result) {
        onChange(result.url);
        onSetField?.(config.keyField, result.key);
        return result;
      }
      return null;
    },
    [upload, onChange, onSetField, config.keyField],
  );

  const handleDelete = useCallback(
    async (key?: string) => {
      if (key) {
        await remove(key);
      }
      onChange(null);
      onSetField?.(config.keyField, null);
    },
    [remove, onChange, onSetField, config.keyField],
  );

  return (
    <FileUpload
      value={value}
      onUpload={handleUpload}
      onDelete={handleDelete}
      fileKey={currentKey}
      isUploading={isUploading}
      id={id}
      accept={config.accept}
      description={config.description}
    />
  );
}
