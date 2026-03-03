import path from 'path';
import crypto from 'crypto';
import type { StorageAdapter, UploadResult } from './storage-adapter';

// ============================================
// AWS S3 保存アダプタ（スケルトン）
//
// 本番対応時に以下を実施:
// 1. `npm install @aws-sdk/client-s3` を実行
// 2. 下記コメントを解除して実装を完成させる
// 3. .env に AWS_REGION / AWS_S3_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY を設定
// ============================================

export class S3StorageAdapter implements StorageAdapter {
  // private client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor() {
    this.region = process.env.AWS_REGION ?? 'ap-northeast-1';
    this.bucket = process.env.AWS_S3_BUCKET ?? '';

    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET 環境変数が設定されていません');
    }

    // this.client = new S3Client({
    //   region: this.region,
    //   credentials: {
    //     accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    //     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    //   },
    // });
  }

  async upload(
    _file: Buffer,
    filename: string,
    _contentType: string,
    directory: string,
  ): Promise<UploadResult> {
    const ext = path.extname(filename).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const key = `${directory}/${uniqueName}`;

    // await this.client.send(new PutObjectCommand({
    //   Bucket: this.bucket,
    //   Key: key,
    //   Body: _file,
    //   ContentType: _contentType,
    // }));

    throw new Error('S3StorageAdapter は本番対応時に実装してください。@aws-sdk/client-s3 のインストールが必要です。');

    return {
      key,
      url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(_key: string): Promise<void> {
    // await this.client.send(new DeleteObjectCommand({
    //   Bucket: this.bucket,
    //   Key: _key,
    // }));
    throw new Error('S3StorageAdapter は本番対応時に実装してください。');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async exists(_key: string): Promise<boolean> {
    // try {
    //   await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: _key }));
    //   return true;
    // } catch {
    //   return false;
    // }
    throw new Error('S3StorageAdapter は本番対応時に実装してください。');
  }
}
