import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { StorageAdapter, UploadResult } from './storage-adapter';

// ============================================
// ローカルファイルシステム保存アダプタ
// 開発環境用。ファイルは public/uploads/ に保存される。
// ============================================

export class LocalStorageAdapter implements StorageAdapter {
  private readonly basePath: string;

  constructor() {
    this.basePath = path.join(process.cwd(), 'public', 'uploads');
  }

  async upload(
    file: Buffer,
    filename: string,
    contentType: string,
    directory: string,
  ): Promise<UploadResult> {
    const ext = path.extname(filename).toLowerCase() || this.extFromMime(contentType);
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const key = `${directory}/${uniqueName}`;
    const fullPath = path.join(this.basePath, key);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file);

    return {
      key,
      url: `/uploads/${key}`,
    };
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    await fs.unlink(fullPath).catch(() => {
      // ファイルが存在しない場合は無視
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.basePath, key));
      return true;
    } catch {
      return false;
    }
  }

  private extFromMime(contentType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return map[contentType] ?? '.bin';
  }
}
