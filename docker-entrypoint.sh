#!/bin/sh
set -e

PRISMA="node ./node_modules/prisma/build/index.js"

# 既存DB（本番）には 0_init を実行せず「適用済み」として記録するだけにする。
# 新規DBでは何もしない（migrate deploy が 0_init を普通に実行する）。
echo "[entrypoint] Checking migration baseline..."
BASELINE_RC=0
node ./scripts/baseline-check.js || BASELINE_RC=$?
if [ "$BASELINE_RC" -eq 0 ]; then
  echo "[entrypoint] Marking 0_init as applied..."
  $PRISMA migrate resolve --applied 0_init 2>&1 || echo "[entrypoint] WARNING: baseline resolve failed"
elif [ "$BASELINE_RC" -ne 10 ]; then
  echo "[entrypoint] WARNING: baseline check failed. Continuing anyway..."
fi

echo "[entrypoint] Running Prisma migrate deploy..."
if $PRISMA migrate deploy 2>&1; then
  echo "[entrypoint] Migration completed successfully"
else
  echo "[entrypoint] Migration failed. Cleaning up failed migration records..."

  # _prisma_migrations テーブルから失敗レコードを直接削除して再試行
  # Prisma の DB URL を使って node で SQL 実行
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    (async () => {
      try {
        const failed = await prisma.\$queryRaw\`
          SELECT migration_name FROM _prisma_migrations
          WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
        \`;
        if (failed.length > 0) {
          console.log('[entrypoint] Found failed migrations:', failed.map(r => r.migration_name));
          await prisma.\$executeRaw\`
            DELETE FROM _prisma_migrations
            WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
          \`;
          console.log('[entrypoint] Deleted failed migration records');
        } else {
          console.log('[entrypoint] No failed migration records found');
        }
      } catch (e) {
        console.error('[entrypoint] DB cleanup error:', e.message);
      } finally {
        await prisma.\$disconnect();
      }
    })();
  " 2>&1

  echo "[entrypoint] Retrying migrate deploy..."
  if $PRISMA migrate deploy 2>&1; then
    echo "[entrypoint] Migration retry succeeded"
  else
    echo "[entrypoint] ERROR: Migration retry also failed. Continuing anyway..."
  fi
fi

# 発行パスワードの平文 → AES-256-GCM 暗号化（冪等・実質1回だけ効く移行）
# 失敗してもアプリ自体は動く（平文フォールバックがあるため）ので、
# ここでコンテナを落とさない。
echo "[entrypoint] Encrypting legacy plaintext passwords..."
if node ./scripts/encrypt-existing-passwords.js 2>&1; then
  echo "[entrypoint] Password encryption step completed"
else
  echo "[entrypoint] WARNING: Password encryption failed. Continuing anyway..."
fi

echo "[entrypoint] Starting server..."
exec node server.js
