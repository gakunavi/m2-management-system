/**
 * 本番用シードスクリプト
 *
 * 管理者アカウントのみを作成する。
 * 既存データがある場合はスキップする（冪等性あり）。
 *
 * 使い方:
 *   npx tsx prisma/seed-production.ts
 *
 * 環境変数:
 *   ADMIN_PASSWORD — 管理者パスワード（必須）
 *   DATABASE_URL   — PostgreSQL接続文字列
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SALT_ROUNDS = 12; // 本番は開発(10)より高め

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('Error: ADMIN_PASSWORD 環境変数を設定してください');
    process.exit(1);
  }

  if (adminPassword.length < 8) {
    console.error('Error: パスワードは8文字以上で設定してください');
    process.exit(1);
  }

  const adminEmail = 'admin@gakunavi.co.jp';

  // 既存チェック（冪等性）
  const existing = await prisma.user.findUnique({
    where: { userEmail: adminEmail },
  });

  if (existing) {
    console.log(`[Skip] 管理者アカウント (${adminEmail}) は既に存在します`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);

  await prisma.user.create({
    data: {
      userEmail: adminEmail,
      userPasswordHash: passwordHash,
      userName: '管理者',
      userRole: 'admin',
    },
  });

  console.log(`[Created] 管理者アカウント: ${adminEmail}`);
  console.log('本番用シード完了。事業・顧客等のマスタデータは管理画面から登録してください。');
}

main()
  .catch((e) => {
    console.error('Production seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
