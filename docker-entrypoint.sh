#!/bin/sh
set -e

PRISMA="node ./node_modules/prisma/build/index.js"

echo "[entrypoint] Running Prisma migrate deploy..."
$PRISMA migrate deploy 2>&1 || echo "[entrypoint] Migration skipped or no pending migrations"

echo "[entrypoint] Starting server..."
exec node server.js
