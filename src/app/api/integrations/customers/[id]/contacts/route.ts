import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import { customerAdminUrl } from '@/lib/integration-url';
import { logger } from '@/lib/logger';
import { buildContactItem } from '@/lib/integration-contacts-read';
import { findIntegrationCustomerByCode } from '@/lib/ml-scope';
import {
  handleIntegrationWrite,
  IDEMPOTENCY_SCOPE_ML_CONTACT,
} from '@/lib/integration-write';
import { createCustomerContact } from '@/lib/customer-contact-update';
import { recordIntegrationChange, changedFieldNames } from '@/lib/integration-change-log';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/integrations/customers/{customer_code}/contacts
//
// ML管理システムのマシン契約マスタ詳細画面向け。担当者を全員返す。
//
// - 認証: Authorization: Bearer <INTEGRATION_READONLY_TOKEN>（書き込み用では通らない）
// - 対象: env INTEGRATION_BUSINESS_CODE（既定 LIGHT）に紐づく顧客のみ。それ以外は 404
// - 口座情報・法人番号・インボイス番号・住所・名刺画像のURLは返さない
// - ⚠️ レスポンス本文はログに出さないこと（担当者の電話・メールを含む）
//
// POST /api/integrations/customers/{customer_code}/contacts
//
// 担当者の追加。認証は書き込み用トークン（INTEGRATION_API_TOKEN）。
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authorizeIntegrationRequest(request, 'read');
  if (!auth.ok) return auth.response;

  try {
    // このパスの [id] には顧客コード（CST-0001）が入る。
    // 既存の GET /api/integrations/customers/{id}（数値ID・読み戻し検算用）とは
    // 別の口で、Next.js の制約で同じ階層のセグメント名を共有している。
    const { id: customerCode } = await params;

    const scope = await findIntegrationCustomerByCode(prisma, customerCode);
    // 事業外・無効化済み・存在しないを区別せず 404（事業外の顧客の存在を漏らさない）
    if (!scope) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [customer, contacts] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: scope.customerId },
        select: { version: true },
      }),
      prisma.customerContact.findMany({
        where: { customerId: scope.customerId },
        orderBy: [{ contactSortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          contactName: true,
          contactDepartment: true,
          contactPosition: true,
          contactIsRepresentative: true,
          contactIsPrimary: true,
          contactPhone: true,
      contactMobile: true,
          contactFax: true,
          contactEmail: true,
          contactBusinessCardFrontUrl: true,
          contactBusinessCardBackUrl: true,
          updatedAt: true,
          businessLinks: {
            select: { business: { select: { businessCode: true, businessName: true } } },
          },
        },
      }),
    ]);

    return NextResponse.json({
      customer: {
        customer_code: scope.customerCode,
        customer_url: customerAdminUrl(scope.customerId),
        // 顧客PATCH の楽観ロックで送り返す値。ML は画面を開いた時点の値を持っておく
        version: customer?.version ?? null,
      },
      meta: { count: contacts.length },
      items: contacts.map(buildContactItem),
    });
  } catch (error) {
    // 担当者の連絡先を含むため、エラー内容以外は出さない
    logger.error('連携API(contacts): 担当者の読み出しに失敗しました', error, 'ml-contacts-read');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customerCode } = await params;

  return handleIntegrationWrite(request, {
    scope: IDEMPOTENCY_SCOPE_ML_CONTACT,
    resourceKey: `customer:${customerCode}:contacts`,
    logContext: 'ml-contact-write',
    handler: async ({ actor, body }) => {
      const scope = await findIntegrationCustomerByCode(prisma, customerCode);
      if (!scope) return { status: 404, body: { error: 'Not found' } };

      // 主担当を1人までに保つ排他制御は画面と同じ共通実装が持つ
      const contact = await createCustomerContact(prisma, scope.customerId, body, actor);

      await recordIntegrationChange(prisma, actor, {
        entityType: 'contact',
        entityId: contact.id,
        entityKey: scope.customerCode,
        action: 'create',
        changedFields: changedFieldNames(body),
      });

      return { status: 201, body: { ...buildContactItem(contact), customer_code: scope.customerCode } };
    },
  });
}
