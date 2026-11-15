// ============================================
// 環境B(manage.1quon.com)の復旧ツール
// ============================================
//
// 2026-08-26 の障害対応で追加。ECS run-task でコンテナ内から実行する想定。
// コンテナには DATABASE_URL / NEXTAUTH_SECRET が入っているので追加の設定は不要。
//
// 【なぜ生SQLしか使わないか】
// このスクリプトが必要な状況では、Prisma スキーマとDBの実体がズレている
// （projects.reward_snapshot が無い等）。prisma.project.findMany() のような
// モデル経由の呼び出しは全カラムを SELECT するため、その場で落ちる。
// したがって $queryRawUnsafe / $executeRawUnsafe だけを使う。
//
// 使い方:
//   node scripts/repair-env-b.js                      # 調査のみ（変更しない）
//   node scripts/repair-env-b.js --fix-duplicates     # 法人番号の重複を解消
//   node scripts/repair-env-b.js --activate=a@b.com   # ユーザーを有効化
//   node scripts/repair-env-b.js --set-password=a@b.com  # 仮パスワードを発行

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { createCipheriv, randomBytes, scryptSync, createDecipheriv } = require('crypto');

// src/lib/encryption.ts と同一仕様（AES-256-GCM / 用途別ソルト / "iv:enc:tag"）
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const PURPOSE_USER_PASSWORD = 'user-password-salt';

function getKey(purpose) {
  const secret = process.env.ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('ENCRYPTION_KEY または NEXTAUTH_SECRET が設定されていません');
  return scryptSync(secret, purpose, 32);
}

function encryptValue(plainText, purpose = PURPOSE_USER_PASSWORD) {
  const key = getKey(purpose);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let enc = cipher.update(plainText, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${enc}:${cipher.getAuthTag().toString('hex')}`;
}

function isEncrypted(value) {
  const parts = String(value).split(':');
  if (parts.length !== 3) return false;
  const [iv, enc, tag] = parts;
  return (
    iv.length === IV_LENGTH * 2 &&
    tag.length === 32 &&
    /^[0-9a-f]*$/i.test(iv) &&
    /^[0-9a-f]*$/i.test(enc) &&
    /^[0-9a-f]*$/i.test(tag)
  );
}

function decryptSafe(stored) {
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored; // 移行前の平文
  try {
    const key = getKey(PURPOSE_USER_PASSWORD);
    const [ivHex, enc, tagHex] = stored.split(':');
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let out = decipher.update(enc, 'hex', 'utf8');
    out += decipher.final('utf8');
    return out;
  } catch {
    return null; // 鍵が違う等。1件の失敗で全体を止めない
  }
}

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const has = (name) => process.argv.includes(`--${name}`);

const prisma = new PrismaClient();

async function reportMigrations() {
  console.log('\n=== マイグレーション状態 ===');
  const rows = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations ORDER BY started_at DESC LIMIT 10
  `);
  for (const r of rows) {
    const state = r.rolled_back_at ? 'ROLLED BACK' : r.finished_at ? 'applied' : '*** FAILED / 未完了 ***';
    console.log(`  ${r.migration_name}: ${state}`);
  }

  const cols = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'projects' AND column_name = 'reward_snapshot')
       OR (table_name = 'partner_business_links' AND column_name = 'company_share_slots')
  `);
  console.log(`  必要カラムの存在: ${cols.length}/2`);
  for (const c of cols) console.log(`    ok: ${c.table_name}.${c.column_name}`);
  if (cols.length < 2) console.log('    → 不足あり。重複解消後にサービス再デプロイが必要');
}

async function reportDuplicates() {
  console.log('\n=== 法人番号の重複 ===');
  const dups = await prisma.$queryRawUnsafe(`
    SELECT customer_corporate_number AS num, COUNT(*)::int AS cnt
    FROM customers
    WHERE customer_corporate_number IS NOT NULL AND customer_corporate_number <> ''
    GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 2 DESC
  `);
  if (dups.length === 0) {
    console.log('  重複なし');
    return dups;
  }
  for (const d of dups) {
    console.log(`  ${d.num}: ${d.cnt}件`);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, customer_name, created_at FROM customers
       WHERE customer_corporate_number = $1 ORDER BY id`,
      d.num,
    );
    for (const r of rows) console.log(`     id=${r.id} ${r.customer_name} (作成 ${r.created_at})`);
  }
  // 空文字も UNIQUE 制約に引っかかるので併せて報告
  const blanks = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS cnt FROM customers WHERE customer_corporate_number = ''`,
  );
  if (blanks[0].cnt > 1) console.log(`  空文字 '' が ${blanks[0].cnt} 件（NULL に正規化が必要）`);
  return dups;
}

async function fixDuplicates() {
  console.log('\n=== 法人番号の重複を解消 ===');
  // 空文字は NULL に寄せる（全書き込み経路は || null で正規化済み。過去データの残骸のみ）
  const blanked = await prisma.$executeRawUnsafe(
    `UPDATE customers SET customer_corporate_number = NULL WHERE customer_corporate_number = ''`,
  );
  if (blanked > 0) console.log(`  空文字 → NULL: ${blanked}件`);

  // 重複は「最も古い1件（id最小）」を正とし、それ以外を NULL にする。
  // レコード自体は消さない。法人番号は後から人が正しい方へ入れ直せる。
  const affected = await prisma.$executeRawUnsafe(`
    UPDATE customers SET customer_corporate_number = NULL
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY customer_corporate_number ORDER BY id
        ) AS rn
        FROM customers
        WHERE customer_corporate_number IS NOT NULL
      ) t WHERE t.rn > 1
    )
  `);
  console.log(`  重複解消: ${affected}件の法人番号を NULL にしました（顧客レコードは削除していません）`);
}

async function reportUsers() {
  console.log('\n=== ユーザー ===');
  const users = await prisma.$queryRawUnsafe(`
    SELECT id, user_email, user_name, user_role, user_is_active,
           user_password_encrypted, updated_at, updated_by
    FROM users ORDER BY updated_at DESC NULLS LAST
  `);
  for (const u of users) {
    const issued = decryptSafe(u.user_password_encrypted);
    console.log(
      `  id=${u.id} ${u.user_email} (${u.user_name}) role=${u.user_role} ` +
        `有効=${u.user_is_active} 更新=${u.updated_at} by=${u.updated_by ?? '-'} ` +
        `発行PW=${issued ? issued : '(なし/復号不可)'}`,
    );
  }
  return users;
}

async function activate(email) {
  const n = await prisma.$executeRawUnsafe(
    `UPDATE users SET user_is_active = true WHERE user_email = $1`,
    email,
  );
  console.log(`\n=== 有効化: ${email} → ${n}件更新 ===`);
}

async function setPassword(email) {
  // コマンドラインに平文を載せない（CloudTrail に残るため）。ここで生成する。
  const pw = randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12) + 'a1';
  const hash = await bcrypt.hash(pw, 12);
  const enc = encryptValue(pw);
  const n = await prisma.$executeRawUnsafe(
    `UPDATE users SET user_password_hash = $1, user_password_encrypted = $2 WHERE user_email = $3`,
    hash,
    enc,
    email,
  );
  if (n === 0) {
    console.log(`\n=== パスワード再発行: ${email} → 該当ユーザーなし ===`);
    return;
  }
  console.log(`\n=== パスワード再発行: ${email} ===`);
  console.log(`  仮パスワード: ${pw}`);
  console.log('  ※このログはCloudWatchに残ります。ログイン後に必ず変更してください。');
}

(async () => {
  try {
    await reportMigrations();
    const dups = await reportDuplicates();
    await reportUsers();

    if (has('fix-duplicates')) {
      if (dups.length === 0) console.log('\n重複なしのため変更しません');
      else await fixDuplicates();
    }

    const act = arg('activate');
    if (act) await activate(act);

    const setPw = arg('set-password');
    if (setPw) await setPassword(setPw);

    if (!has('fix-duplicates') && !act && !setPw) {
      console.log('\n(調査のみ。変更していません)');
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
