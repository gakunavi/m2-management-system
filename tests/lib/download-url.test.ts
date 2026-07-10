import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractStorageKey, getDownloadUrl } from '@/lib/storage/download-url';
import { resetStorageAdapter } from '@/lib/storage';

describe('extractStorageKey', () => {
  it('公開URLからキーを取り出す', () => {
    expect(
      extractStorageKey('https://m2-uploads.s3.ap-northeast-1.amazonaws.com/business-documents/5/x.pdf'),
    ).toBe('business-documents/5/x.pdf');
  });

  it('URLエンコードされたキーをデコードする', () => {
    expect(
      extractStorageKey('https://bucket.s3.ap-northeast-1.amazonaws.com/a/b%20c.pdf'),
    ).toBe('a/b c.pdf');
  });

  it('すでにキー形式ならそのまま返す', () => {
    expect(extractStorageKey('business-cards/abc.png')).toBe('business-cards/abc.png');
  });

  it('先頭スラッシュを除く', () => {
    expect(extractStorageKey('/docs/x.pdf')).toBe('docs/x.pdf');
  });
});

describe('getDownloadUrl（ローカルストレージ）', () => {
  beforeEach(() => {
    process.env.STORAGE_PROVIDER = 'local';
    resetStorageAdapter();
  });

  it('キーから /uploads パスを生成する', async () => {
    expect(await getDownloadUrl('business-cards/abc.png', null)).toBe('/uploads/business-cards/abc.png');
  });

  it('キーが無ければ fallbackURL からキーを抽出して使う', async () => {
    expect(
      await getDownloadUrl(null, 'https://bucket.s3.ap-northeast-1.amazonaws.com/docs/x.pdf'),
    ).toBe('/uploads/docs/x.pdf');
  });

  it('どちらも無ければ空文字を返す', async () => {
    expect(await getDownloadUrl(null, null)).toBe('');
    expect(await getDownloadUrl('', undefined)).toBe('');
  });
});

describe('getDownloadUrl（S3・署名付きURL）', () => {
  beforeEach(() => {
    process.env.STORAGE_PROVIDER = 's3';
    process.env.AWS_S3_BUCKET = 'test-bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.AWS_ACCESS_KEY_ID = 'AKIATEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'secrettest';
    resetStorageAdapter();
  });

  it('署名付きURL（有効期限つき）を生成する', async () => {
    const url = await getDownloadUrl('business-documents/5/x.pdf', null);
    expect(url).toContain('test-bucket.s3.ap-northeast-1.amazonaws.com/business-documents/5/x.pdf');
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('X-Amz-Expires=300');
  });

  it('保存された公開URLからでも署名付きURLを生成する（旧データ互換）', async () => {
    const url = await getDownloadUrl(
      null,
      'https://test-bucket.s3.ap-northeast-1.amazonaws.com/docs/legacy.pdf',
    );
    expect(url).toContain('/docs/legacy.pdf');
    expect(url).toContain('X-Amz-Signature=');
  });

  it('署名に失敗しても例外を投げず fallbackURL を返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // バケット未設定 → アダプタ生成で throw する状況を作る
    delete process.env.AWS_S3_BUCKET;
    resetStorageAdapter();
    const fallback = 'https://x.s3.amazonaws.com/y.pdf';
    expect(await getDownloadUrl('a/b.pdf', fallback)).toBe(fallback);
    vi.restoreAllMocks();
  });
});
