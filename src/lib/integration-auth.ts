// ============================================
// 外部システム連携 API（/api/integrations/**）の認証・入口ガード
// ============================================
//
// 既存の経営統計 API（/api/stats/strategy-report）と同じ方針:
//   - Authorization: Bearer <INTEGRATION_API_TOKEN>
//   - トークン未設定 → エンドポイント自体を無効化（404）
//   - トークン不一致／未指定 → 401（理由は返さない）
//
// 加えて本 API は口座番号・法人番号を受け取るため、以下を入口で強制する:
//   - HTTPS のみ（ALB で TLS 終端するため x-forwarded-proto で判定）
//   - IP 許可リスト（env 未設定なら無効＝トークンのみで認証）
//
// レート制限（60回/分/IP）は src/middleware.ts 側で適用している。

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export type IntegrationAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/** タイミング攻撃を避けるトークン比較 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** 呼び出し元IP（ALB 経由のため x-forwarded-for の先頭を採用） */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** 401: 理由は返さない（列挙攻撃の手掛かりを与えない） */
function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * 連携 API 共通の入口チェック。
 * 認証に成功したときだけ { ok: true } を返す。
 */
export function authorizeIntegrationRequest(request: NextRequest): IntegrationAuthResult {
  const token = process.env.INTEGRATION_API_TOKEN;

  // トークン未設定 → エンドポイント無効化（存在自体を隠す）
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  // --- HTTPS 強制 --------------------------------------------------------
  // 本番は ALB で TLS 終端するため、アプリに届く時点では http。
  // x-forwarded-proto を見て https 以外を弾く（ヘッダ自体が無い場合は ALB 経由でないため弾く）。
  if (process.env.NODE_ENV === 'production') {
    const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    if (proto !== 'https') {
      return {
        ok: false,
        response: NextResponse.json({ error: 'HTTPS required' }, { status: 403 }),
      };
    }
  }

  // --- IP 許可リスト（任意） ---------------------------------------------
  const allowlistRaw = process.env.INTEGRATION_IP_ALLOWLIST;
  if (allowlistRaw && allowlistRaw.trim() !== '') {
    const allowed = allowlistRaw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '');
    const ip = getClientIp(request);
    if (!allowed.includes(ip)) {
      logger.warn('連携API: 許可リスト外のIPからのアクセスを拒否', { ip }, 'integration-auth');
      return { ok: false, response: unauthorized() };
    }
  }

  // --- Bearer トークン ---------------------------------------------------
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, response: unauthorized() };
  }
  if (!safeEqual(authHeader.slice('Bearer '.length), token)) {
    return { ok: false, response: unauthorized() };
  }

  return { ok: true };
}
