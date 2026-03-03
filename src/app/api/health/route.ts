import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// ビルド時に package.json から取得（standalone でも動作）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const APP_VERSION: string = require('../../../../package.json').version;

/**
 * ヘルスチェックエンドポイント
 *
 * GET /api/health
 *
 * 用途:
 *  - ロードバランサー / CDN のヘルスチェック
 *  - デプロイ後の動作確認
 *  - 監視ツール (UptimeRobot, Datadog 等)
 *
 * レスポンス:
 *  - 200: 正常稼働中
 *  - 503: サービス利用不可（DB接続失敗等）
 */
export async function GET() {
  const start = Date.now();

  let dbStatus: 'ok' | 'error' = 'ok';
  let dbLatencyMs: number | null = null;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch (error) {
    dbStatus = 'error';
    logger.error('Health check: DB connection failed', error, 'health');
  }

  const totalLatencyMs = Date.now() - start;

  const body = {
    status: dbStatus === 'ok' ? 'healthy' : 'unhealthy',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    checks: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
    },
    latencyMs: totalLatencyMs,
  };

  const statusCode = dbStatus === 'ok' ? 200 : 503;

  return NextResponse.json(body, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
