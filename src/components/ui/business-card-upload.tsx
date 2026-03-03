'use client';

import { ImageUpload } from '@/components/ui/image-upload';
import { useFileUpload } from '@/hooks/use-file-upload';

// ============================================
// 名刺（表・裏）ペアアップロードコンポーネント
// ============================================

interface BusinessCardUploadProps {
  /** 名刺（表）の現在の URL */
  frontUrl: string | null;
  /** 名刺（裏）の現在の URL */
  backUrl: string | null;
  /** 名刺（表）のファイルキー */
  frontKey?: string | null;
  /** 名刺（裏）のファイルキー */
  backKey?: string | null;
  /** 表アップロード・削除時のコールバック */
  onFrontChange: (url: string | null, key: string | null) => void;
  /** 裏アップロード・削除時のコールバック */
  onBackChange: (url: string | null, key: string | null) => void;
}

export function BusinessCardUpload({
  frontUrl,
  backUrl,
  frontKey,
  backKey,
  onFrontChange,
  onBackChange,
}: BusinessCardUploadProps) {
  const { upload: uploadFront, remove: removeFront, isUploading: isFrontUploading } = useFileUpload({
    directory: 'business-cards',
  });
  const { upload: uploadBack, remove: removeBack, isUploading: isBackUploading } = useFileUpload({
    directory: 'business-cards',
  });

  const handleFrontUpload = async (file: File) => {
    const result = await uploadFront(file);
    if (result) {
      onFrontChange(result.url, result.key);
    }
    return result;
  };

  const handleFrontDelete = async (key?: string) => {
    if (key) {
      await removeFront(key);
    }
    onFrontChange(null, null);
  };

  const handleBackUpload = async (file: File) => {
    const result = await uploadBack(file);
    if (result) {
      onBackChange(result.url, result.key);
    }
    return result;
  };

  const handleBackDelete = async (key?: string) => {
    if (key) {
      await removeBack(key);
    }
    onBackChange(null, null);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ImageUpload
        label="名刺（表）"
        value={frontUrl}
        fileKey={frontKey}
        isUploading={isFrontUploading}
        onUpload={handleFrontUpload}
        onDelete={handleFrontDelete}
      />
      <ImageUpload
        label="名刺（裏）"
        value={backUrl}
        fileKey={backKey}
        isUploading={isBackUploading}
        onUpload={handleBackUpload}
        onDelete={handleBackDelete}
      />
    </div>
  );
}
