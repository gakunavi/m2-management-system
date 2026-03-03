import type { StorageAdapter } from './storage-adapter';
import { LocalStorageAdapter } from './local-storage-adapter';
import { S3StorageAdapter } from './s3-storage-adapter';

export type { StorageAdapter, UploadResult } from './storage-adapter';

// ============================================
// ストレージアダプタファクトリ
// 環境変数 STORAGE_PROVIDER で切り替え:
//   local (デフォルト) → LocalStorageAdapter（開発用）
//   s3               → S3StorageAdapter（本番用）
// ============================================

let _adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (_adapter) return _adapter;

  const provider = process.env.STORAGE_PROVIDER ?? 'local';

  switch (provider) {
    case 's3':
      _adapter = new S3StorageAdapter();
      break;
    case 'local':
    default:
      _adapter = new LocalStorageAdapter();
      break;
  }

  return _adapter;
}

/** テスト用にアダプタをリセットする */
export function resetStorageAdapter(): void {
  _adapter = null;
}
