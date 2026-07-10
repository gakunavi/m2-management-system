import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { StorageAdapter, UploadResult } from './storage-adapter';
import { assertSafeStorageKey } from './storage-key';

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
    const fullPath = this.resolveWithinBase(key);
    await fs.unlink(fullPath).catch(() => {
      // ファイルが存在しない場合は無視
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveWithinBase(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * キーを basePath 配下に解決する。外に出る場合は例外。
   * 呼び出し側（API ルート）でも検証しているが、アダプタ単体でも防ぐ。
   */
  private resolveWithinBase(key: string): string {
    assertSafeStorageKey(key);
    const fullPath = path.resolve(this.basePath, key);
    const base = path.resolve(this.basePath);
    if (fullPath !== base && !fullPath.startsWith(base + path.sep)) {
      throw new Error(`保存領域外へのアクセスです: ${key}`);
    }
    return fullPath;
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
