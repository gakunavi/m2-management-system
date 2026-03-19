#!/bin/sh
set -e

PRISMA="node ./node_modules/prisma/build/index.js"

echo "[entrypoint] Running Prisma migrate deploy..."
if $PRISMA migrate deploy 2>&1; then
  echo "[entrypoint] Migration completed successfully"
else
  echo "[entrypoint] ERROR: Migration failed! Check database connectivity and migration files."
  echo "[entrypoint] Attempting to continue anyway..."
fi

echo "[entrypoint] Starting server..."
exec node server.js
