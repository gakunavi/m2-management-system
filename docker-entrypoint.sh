#!/bin/sh
set -e

PRISMA="node ./node_modules/prisma/build/index.js"

echo "[entrypoint] Running Prisma migrate deploy..."
if $PRISMA migrate deploy 2>&1; then
  echo "[entrypoint] Migration completed successfully"
else
  echo "[entrypoint] Migration failed. Attempting to resolve failed migrations..."
  # 失敗状態のマイグレーションを rolled-back にマークして再試行
  FAILED=$($PRISMA migrate status 2>&1 | sed -n 's/.*Migration `\(.*\)` failed.*/\1/p')
  if [ -n "$FAILED" ]; then
    echo "$FAILED" | while read -r m; do
      echo "[entrypoint] Resolving failed migration: $m"
      $PRISMA migrate resolve --rolled-back "$m" 2>&1 || true
    done
    echo "[entrypoint] Retrying migrate deploy..."
    if $PRISMA migrate deploy 2>&1; then
      echo "[entrypoint] Migration retry succeeded"
    else
      echo "[entrypoint] ERROR: Migration retry also failed. Continuing anyway..."
    fi
  else
    echo "[entrypoint] No failed migrations found to resolve. Continuing anyway..."
  fi
fi

echo "[entrypoint] Starting server..."
exec node server.js
