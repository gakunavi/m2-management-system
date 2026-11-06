import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import { logger } from '@/lib/logger';
import { findIntegrationCustomerByCode } from '@/lib/ml-scope';
import { readMlCustomer } from '@/lib/ml-customer-read';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/integrations/customers/by-code/{customer_code}
//
// ML管理システムの MO（マシンオーナー）詳細画面が読む顧客1件。
// 顧客の画面に出ている項目のうち**口座以外を全部**返す。
//
// - 認証: Authorization: Bearer <INTEGRATION_READONLY_TOKEN>（書き込み用では 401）
// - 対象: env INTEGRATION_BUSINESS_CODE（既定 LIGHT）に紐づく顧客のみ。それ以外は 404
// - 未入力は null。**キーは落とさない**（ML が画面の欄を固定で埋めるため）
//
// なぜ `by-code/` という別の道なのか:
//   同じ階層の `GET /api/integrations/customers/{id}` は取り込みの読み戻し検算用で、
//   数値ID・書き込み用トークン・口座あり。挙動を変えないと決めているうえ、Next.js は
//   同じ階層で別名の動的セグメント（[id] と [customerCode]）を持てない。
//
// ⚠️ レスポンス本文はログに出さないこと。
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerCode: string }> },
) {
  const auth = authorizeIntegrationRequest(request, 'read');
  if (!auth.ok) return auth.response;

  try {
    const { customerCode } = await params;
    const scope = await findIntegrationCustomerByCode(prisma, decodeURIComponent(customerCode));
    if (!scope) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const item = await readMlCustomer(prisma, {
      customerId: scope.customerId,
      businessId: scope.businessId,
    });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(item);
  } catch (error) {
    logger.error('連携API(customers): 顧客の読み出しに失敗しました', error, 'ml-customer-read');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
