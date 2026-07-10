-- 発行パスワードを平文保存から AES-256-GCM 暗号化保存へ移行する。
--
-- このマイグレーションはカラムのリネームと型拡張のみを行う。
-- 既存の値は平文のまま残るため、適用後に必ず暗号化スクリプトを実行すること:
--   npx tsx scripts/encrypt-existing-passwords.ts
--
-- アプリ側（src/lib/password-vault.ts）は移行期の互換として、
-- 暗号文の形式でない値を平文とみなして読み出せるようにしてある。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'user_password_plain'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'user_password_encrypted'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "user_password_plain" TO "user_password_encrypted";
  END IF;
END $$;

-- 暗号文は "iv:encrypted:authTag" 形式で平文より長くなるため上限を広げる
ALTER TABLE "users"
  ALTER COLUMN "user_password_encrypted" TYPE VARCHAR(512);
