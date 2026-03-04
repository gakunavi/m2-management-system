# ============================================
# Stage 1: 依存関係インストール
# ============================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ============================================
# Stage 2: ビルド
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client 生成
RUN npx prisma generate

# Next.js ビルド（standalone 出力）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================
# Stage 3: 本番ランナー
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# OpenSSL（Prisma 必須）
RUN apk add --no-cache openssl

# セキュリティ: non-root ユーザーで実行
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# standalone 出力 + 静的ファイルをコピー
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma マイグレーション用（CLI + Client + 書込み権限）
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/package.json ./package.json

# エントリポイントスクリプト（migrate deploy → server 起動）
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "docker-entrypoint.sh"]
