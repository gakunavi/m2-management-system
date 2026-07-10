import { describe, it, expect } from 'vitest';
import { isSafeStorageKey, assertSafeStorageKey } from '@/lib/storage/storage-key';

describe('isSafeStorageKey', () => {
  it('通常のキーを許可する', () => {
    expect(isSafeStorageKey('business-cards/1720000000-abcdef0123456789.png')).toBe(true);
    expect(isSafeStorageKey('documents/file.pdf')).toBe(true);
  });

  it('相対参照を拒否する', () => {
    expect(isSafeStorageKey('../../etc/passwd')).toBe(false);
    expect(isSafeStorageKey('uploads/../../secret.txt')).toBe(false);
    expect(isSafeStorageKey('..')).toBe(false);
    expect(isSafeStorageKey('./file.png')).toBe(false);
  });

  it('バックスラッシュ区切りの相対参照も拒否する', () => {
    expect(isSafeStorageKey('..\\..\\secret.txt')).toBe(false);
  });

  it('絶対パスを拒否する', () => {
    expect(isSafeStorageKey('/etc/passwd')).toBe(false);
    expect(isSafeStorageKey('\\windows\\system32')).toBe(false);
    expect(isSafeStorageKey('C:/Windows/System32')).toBe(false);
  });

  it('NULバイトを拒否する', () => {
    expect(isSafeStorageKey('file.png\0.txt')).toBe(false);
  });

  it('空文字を拒否する', () => {
    expect(isSafeStorageKey('')).toBe(false);
  });
});

describe('assertSafeStorageKey', () => {
  it('安全なキーは通す', () => {
    expect(() => assertSafeStorageKey('docs/a.pdf')).not.toThrow();
  });

  it('危険なキーは例外を投げる', () => {
    expect(() => assertSafeStorageKey('../../etc/passwd')).toThrow();
  });
});
