// ============================================
// ルート内のロール検証ヘルパー
// ============================================
//
// middleware（src/lib/partner-api-allowlist.ts）で代理店ロールの社内APIアクセスは
// 一元的に遮断しているが、各ルートでも同じ検証を行う（多層防御）。
// middleware の matcher 変更・新しい呼び出し経路の追加で穴が空いても、
// ここで止まるようにしておく。

import type { Session } from 'next-auth';
import { ApiError } from '@/lib/error-handler';

export interface SessionUser {
  id: number;
  role: string;
  partnerId?: number;
}

const INTERNAL_ROLES = ['admin', 'staff'];

/**
 * 社内ユーザー（admin / staff）であることを要求する。
 * 代理店ロールなど、それ以外は 403。
 */
export function requireInternalUser(session: Session): SessionUser {
  const user = session.user as unknown as SessionUser;
  if (!INTERNAL_ROLES.includes(user.role)) {
    throw ApiError.forbidden();
  }
  return user;
}

/**
 * 管理者（admin）であることを要求する。
 */
export function requireAdmin(session: Session): SessionUser {
  const user = session.user as unknown as SessionUser;
  if (user.role !== 'admin') {
    throw ApiError.forbidden();
  }
  return user;
}
