#!/bin/sh
set -e

PRISMA="node ./node_modules/prisma/build/index.js"

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

echo "[entrypoint] Starting server..."
exec node server.js
