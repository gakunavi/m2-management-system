import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import { decryptPasswordSafe, encryptPassword as appEncrypt } from '@/lib/password-vault';
import { isEncrypted as appIsEncrypted } from '@/lib/encryption';

// 本番イメージには ts-node も src/ も入らないため、移行スクリプトは
// 暗号化ロジックを自前で持っている。両者がずれると本番のパスワードが
// 復号できなくなるので、ここで一致を検証する。
const require = createRequire(import.meta.url);
const script = require('../../scripts/encrypt-existing-passwords.js') as {
  encryptPassword: (plain: string) => string;
  isEncrypted: (value: string) => boolean;
};

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'parity-test-key';
});

describe('移行スクリプトとアプリの暗号化が互換であること', () => {
  it('スクリプトが暗号化した値をアプリが復号できる', () => {
    const cipherText = script.encryptPassword('Secret-Pw-9x');
    expect(decryptPasswordSafe(cipherText)).toBe('Secret-Pw-9x');
  });

  it('アプリが暗号化した値をスクリプトが「暗号化済み」と判定する（二重暗号化しない）', () => {
    const cipherText = appEncrypt('Secret-Pw-9x');
    expect(script.isEncrypted(cipherText)).toBe(true);
  });

  it('スクリプトが暗号化した値をアプリも「暗号化済み」と判定する', () => {
    const cipherText = script.encryptPassword('Secret-Pw-9x');
    expect(appIsEncrypted(cipherText)).toBe(true);
  });

  it('平文はどちらも「未暗号化」と判定する', () => {
    expect(script.isEncrypted('admin123')).toBe(false);
    expect(appIsEncrypted('admin123')).toBe(false);
  });

  it('日本語・記号を含むパスワードでも往復できる', () => {
    const password = 'パスワード!@#$%^&*()_+';
    expect(decryptPasswordSafe(script.encryptPassword(password))).toBe(password);
  });

  it('ENCRYPTION_KEY が違うと復号できない（鍵の取り違えを検知できる）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cipherText = script.encryptPassword('secret');
    process.env.ENCRYPTION_KEY = 'different-key';
    expect(decryptPasswordSafe(cipherText)).toBeNull();
    process.env.ENCRYPTION_KEY = 'parity-test-key';
    vi.restoreAllMocks();
  });
});
