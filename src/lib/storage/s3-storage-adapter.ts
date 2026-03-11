import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { StorageAdapter, UploadResult } from './storage-adapter';

// ============================================
// AWS S3 保存アダプタ
// ============================================

export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor() {
    this.region = process.env.AWS_REGION ?? 'ap-northeast-1';
    this.bucket = process.env.AWS_S3_BUCKET ?? '';

    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET 環境変数が設定されていません');
    }

    this.client = new S3Client({
      region: this.region,
      // ECS タスクロール or 環境変数から認証情報を取得
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async upload(
    file: Buffer,
    filename: string,
    contentType: string,
    directory: string,
  ): Promise<UploadResult> {
    const ext = path.extname(filename).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const key = `${directory}/${uniqueName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: contentType,
      }),
    );

    return {
      key,
      url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
