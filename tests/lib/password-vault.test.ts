import { describe, it, expect, beforeAll, vi } from 'vitest';
import { encryptPassword, decryptPasswordSafe } from '@/lib/password-vault';
import { encrypt, decrypt, isEncrypted, ENCRYPTION_PURPOSE } from '@/lib/encryption';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-password-vault';
});

describe('encryptPassword / decryptPasswordSafe', () => {
  it('暗号化した発行パスワードを復号して元に戻せる', () => {
    const stored = encryptPassword('Xk4p-9wQz');
    expect(decryptPasswordSafe(stored)).toBe('Xk4p-9wQz');
  });

  it('保存値が平文をそのまま含まない', () => {
    const stored = encryptPassword('SuperSecret123');
    expect(stored).not.toContain('SuperSecret123');
    expect(isEncrypted(stored)).toBe(true);
  });

  it('同じパスワードでも毎回異なる暗号文になる（IVがランダム）', () => {
    expect(encryptPassword('same')).not.toBe(encryptPassword('same'));
  });

  it('日本語や記号を含むパスワードも往復できる', () => {
    const password = 'パスワード!@#$%^&*()_+😀';
    expect(decryptPasswordSafe(encryptPassword(password))).toBe(password);
  });

  it('null を渡すと null を返す', () => {
    expect(decryptPasswordSafe(null)).toBeNull();
  });

  it('移行期の互換: 暗号化されていない平文はそのまま返す', () => {
    expect(decryptPasswordSafe('admin123')).toBe('admin123');
  });

  it('改ざんされた暗号文は例外を投げず null を返す', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stored = encryptPassword('secret');
    const [iv, , authTag] = stored.split(':');
    const tampered = `${iv}:${'0'.repeat(16)}:${authTag}`;

    expect(isEncrypted(tampered)).toBe(true);
    expect(decryptPasswordSafe(tampered)).toBeNull();
  });
});

describe('用途別の鍵分離', () => {
  it('システム設定用の鍵で暗号化した値はパスワード用の鍵で復号できない', () => {
    const cipherText = encrypt('secret', ENCRYPTION_PURPOSE.systemSettings);

    expect(() => decrypt(cipherText, ENCRYPTION_PURPOSE.userPassword)).toThrow();
  });

  it('デフォルトの purpose はシステム設定用（既存データとの後方互換）', () => {
    const cipherText = encrypt('secret');
    expect(decrypt(cipherText, ENCRYPTION_PURPOSE.systemSettings)).toBe('secret');
    expect(decrypt(cipherText)).toBe('secret');
  });
});

describe('isEncrypted', () => {
  it('暗号文の形式を判定する', () => {
    expect(isEncrypted(encryptPassword('x'))).toBe(true);
  });

  it('平文や不正な形式は false', () => {
    expect(isEncrypted('admin123')).toBe(false);
    expect(isEncrypted('a:b:c')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    // コロンを含むだけの平文パスワードを暗号文と誤認しない
    expect(isEncrypted('my:pass:word')).toBe(false);
  });
});
