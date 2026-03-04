#!/bin/sh
set -e

echo "[entrypoint] Running Prisma migrate deploy..."
npx prisma migrate deploy 2>&1 || echo "[entrypoint] Migration failed or no pending migrations"

echo "[entrypoint] Starting server..."
exec node server.js
