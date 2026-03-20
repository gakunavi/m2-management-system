import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { checkRateLimit, AUTH_RATE_LIMIT, UPLOAD_RATE_LIMIT, API_RATE_LIMIT } from '@/lib/rate-limit';

function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  );
}

function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { success: false, error: { message: 'リクエスト回数の上限に達しました。しばらくしてから再試行してください。' } },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    },
  );
}

// パートナードメイン判定
const PARTNER_DOMAIN = 'partner.gakunavi.co.jp';
function isPartnerDomain(host: string): boolean {
  return host === PARTNER_DOMAIN || host.startsWith(`${PARTNER_DOMAIN}:`);
}

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;
    const token = request.nextauth.token;
    const host = request.headers.get('host') || '';

    // ============================================
    // ドメイン別ルーティング（partner.gakunavi.co.jp）
    // ============================================
    if (isPartnerDomain(host)) {
      // パートナードメインで社内専用パスにアクセス → /portal にリダイレクト
      if (
        pathname.startsWith('/dashboard') ||
        pathname.startsWith('/businesses') ||
        pathname.startsWith('/customers') ||
        pathname.startsWith('/partners') ||
        pathname.startsWith('/projects') ||
        pathname.startsWith('/movements') ||
        pathname.startsWith('/admin') ||
        pathname.startsWith('/announcements')
      ) {
        return NextResponse.redirect(new URL('/portal', request.url));
      }
      // パートナードメインでルートアクセス → /portal にリダイレクト
      if (pathname === '/') {
        return NextResponse.redirect(new URL('/portal', request.url));
      }
    }

    // ============================================
    // レート制限（API リクエストのみ）
    // ============================================
    if (pathname.startsWith('/api/')) {
      const ip = getClientIp(request.headers);
      const userId = token?.sub ?? ip;

      // ログインエンドポイント: IP ベース
      if (pathname.startsWith('/api/auth/callback') || pathname.startsWith('/api/auth/signin')) {
        const result = checkRateLimit(`auth:${ip}`, AUTH_RATE_LIMIT);
        if (!result.allowed) return rateLimitResponse(result.resetAt);
      }
      // アップロード: ユーザーベース
      else if (pathname.includes('/upload') || pathname.includes('/files')) {
        const result = checkRateLimit(`upload:${userId}`, UPLOAD_RATE_LIMIT);
        if (!result.allowed) return rateLimitResponse(result.resetAt);
      }
      // 一般 API: ユーザーベース
      else if (pathname.startsWith('/api/v1/')) {
        const result = checkRateLimit(`api:${userId}`, API_RATE_LIMIT);
        if (!result.allowed) return rateLimitResponse(result.resetAt);
      }
    }

    // ============================================
    // ロール別ルーティング
    // ============================================
    if (!token) {
      return NextResponse.next();
    }

    const role = token.role as string;
    const isPartner = role === 'partner_admin' || role === 'partner_staff';

    // 代理店ユーザーが管理画面にアクセス → /portal にリダイレクト
    if (isPartner && pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }

    // 代理店ユーザーが社内専用ページにアクセス → /portal にリダイレクト
    const internalOnlyPaths = ['/businesses', '/customers', '/partners', '/projects', '/movements', '/admin', '/announcements'];
    if (isPartner && internalOnlyPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }

    // partner_staff がスタッフ管理ページにアクセス → /portal にリダイレクト
    if (role === 'partner_staff' && pathname.startsWith('/portal/staff')) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }

    // 社内ユーザーがポータルにアクセス → /dashboard にリダイレクト
    if (!isPartner && pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // /login、/api/auth、/api/health は認証不要
        if (
          pathname.startsWith('/login') ||
          pathname.startsWith('/api/auth') ||
          pathname === '/api/health' ||
          pathname === '/api/v1/health'
        ) {
          return true;
        }

        // /api/v1/cron は CRON_SECRET で保護（認証不要）
        if (pathname.startsWith('/api/v1/cron')) {
          return true;
        }

        // /api/v1 は認証必須
        if (pathname.startsWith('/api/v1')) {
          return !!token;
        }

        // その他のページも認証必須
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
    },
  },
);

export const config = {
  matcher: [
    // 静的ファイル・アイコン・アップロード画像を除外
    '/((?!_next/static|_next/image|favicon|icon-|apple-touch-icon|uploads|manifest).*)',
  ],
};
