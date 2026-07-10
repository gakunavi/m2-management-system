/**
 * 既存の平文パスワードを AES-256-GCM で暗号化する（1回だけ効く移行スクリプト）。
 *
 * docker-entrypoint.sh から `migrate deploy` の直後に自動実行される。
 * 冪等なので、コンテナが再起動して何度走っても安全。
 *
 * 本番イメージには ts-node が無く、src/ も含まれないため、
 * 素の Node（@prisma/client + node:crypto）だけで動くようにしてある。
 * 暗号化ロジックは src/lib/encryption.ts と一致させること。
 * （tests/lib/encrypt-script-parity.test.ts が両者の一致を検証している）
 *
 * ローカルで手動実行する場合:
 *   DATABASE_URL=... NEXTAUTH_SECRET=... npm run db:encrypt-passwords
 */

/* eslint-disable @typescript-eslint/no-require-imports -- 本番イメージで素の Node が直接実行する CommonJS スクリプト */

const { createCipheriv, createDecipheriv, randomBytes, scryptSync } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
// src/lib/encryption.ts の ENCRYPTION_PURPOSE.userPassword と同じ値
const PASSWORD_SALT = 'user-password-salt';

function getKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY または NEXTAUTH_SECRET が設定されていません');
  }
  return scryptSync(secret, PASSWORD_SALT, 32);
}

function encryptPassword(plainText) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

function decryptPassword(cipherText) {
  const [iv, encrypted, authTag] = cipherText.split(':');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

/** "iv:encrypted:authTag" 形式かどうか（既に暗号化済みかの判定） */
function isEncrypted(value) {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  const [iv, encrypted, authTag] = parts;
  return (
    iv.length === IV_LENGTH * 2 &&
    authTag.length === 32 &&
    /^[0-9a-f]*$/i.test(iv) &&
    /^[0-9a-f]*$/i.test(encrypted) &&
    /^[0-9a-f]*$/i.test(authTag)
  );
}

/**
 * 接続先DBを "host:port/dbname" の形で返す（認証情報は含めない）。
 *
 * 注意: @prisma/client は .env を自動で読み込む。そのため環境変数を
 * 明示しなくても、うっかり別のDBに接続してしまうことがある。
 * 必ず接続先を表示してから処理する。
 */
function describeTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL が設定されていません');
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return '(DATABASE_URL を解析できません)';
  }
}

/**
 * 対話実行（手元のターミナル）のときだけ確認を求める。
 * ECS の entrypoint は TTY が無いのでそのまま進む。
 */
async function confirmIfInteractive(target) {
  if (process.argv.includes('--yes') || !process.stdin.isTTY) return;

  const readline = require('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\n接続先DB: ${target}\nこのDBの発行パスワードを暗号化します。続行しますか? (yes/no) `,
  );
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('[encrypt-passwords] 中止しました');
    process.exit(1);
  }
}

async function columnExists(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'user_password_encrypted'
  `;
  return rows.length > 0;
}

async function run() {
  const target = describeTarget();
  await confirmIfInteractive(target);
  console.log(`[encrypt-passwords] 接続先: ${target}`);

  const prisma = new PrismaClient();
  try {
    if (!(await columnExists(prisma))) {
      console.log('[encrypt-passwords] user_password_encrypted カラムが未作成のためスキップします');
      return;
    }

    const users = await prisma.$queryRaw`
      SELECT id, user_email, user_password_encrypted
      FROM users
      WHERE user_password_encrypted IS NOT NULL
    `;

    const pending = users.filter((u) => !isEncrypted(u.user_password_encrypted));
    const alreadyEncrypted = users.filter((u) => isEncrypted(u.user_password_encrypted));

    if (pending.length === 0) {
      console.log(
        `[encrypt-passwords] 完了: 0 件を暗号化、${alreadyEncrypted.length} 件は暗号化済み`,
      );
      return;
    }

    // 平文が残っているのに鍵が無い場合は、静かに素通りさせず明示的に失敗させる
    getKey();

    // 既存の暗号文が現在の鍵で復号できるか確認する。
    // 復号できないまま暗号化を続けると、異なる鍵の暗号文がDBに混在し、
    // どちらかのパスワードが永久に読めなくなる。
    if (alreadyEncrypted.length > 0) {
      try {
        decryptPassword(alreadyEncrypted[0].user_password_encrypted);
      } catch {
        throw new Error(
          '既存の暗号文を現在の鍵で復号できません。' +
            'ENCRYPTION_KEY（未設定なら NEXTAUTH_SECRET）が以前と異なる可能性があります。' +
            '異なる鍵で暗号化すると復号不能なデータが混在するため、処理を中止しました。',
        );
      }
    }

    let encrypted = 0;
    const skipped = alreadyEncrypted.length;

    for (const user of pending) {
      const stored = user.user_password_encrypted;
      const cipherText = encryptPassword(stored);

      // 書き込む前に往復できることを確認する
      if (decryptPassword(cipherText) !== stored) {
        throw new Error(`暗号化の検証に失敗しました: ${user.user_email}`);
      }

      await prisma.$executeRaw`
        UPDATE users SET user_password_encrypted = ${cipherText} WHERE id = ${user.id}
      `;
      encrypted += 1;
      console.log(`[encrypt-passwords] 暗号化: ${user.user_email}`);
    }

    console.log(
      `[encrypt-passwords] 完了: ${encrypted} 件を暗号化、${skipped} 件は暗号化済み`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[encrypt-passwords] エラー:', error.message);
    process.exit(1);
  });
}

module.exports = { encryptPassword, decryptPassword, isEncrypted, run };
