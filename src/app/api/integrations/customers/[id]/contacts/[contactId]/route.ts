import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildContactItem } from '@/lib/integration-contacts-read';
import { findIntegrationCustomerByCode } from '@/lib/ml-scope';
import {
  handleIntegrationWrite,
  IDEMPOTENCY_SCOPE_ML_CONTACT,
  once,
} from '@/lib/integration-write';
import {
  deleteCustomerContact,
  updateCustomerContact,
} from '@/lib/customer-contact-update';
import { recordIntegrationChange, changedFieldNames } from '@/lib/integration-change-log';
import { ApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// ============================================================================
// PATCH  /api/integrations/customers/{customer_code}/contacts/{id}
// DELETE /api/integrations/customers/{customer_code}/contacts/{id}
//
// - 認証: Authorization: Bearer <INTEGRATION_API_TOKEN>（読み取り用では 401）
// - 変更者: X-ML-User ヘッダー（変更履歴に "ML：<名前>" として残る）
// - 楽観ロック: body / クエリの updatedAt（担当者に version カラムが無いため）
// - 主担当は1人まで（画面と同じ共通実装が保証する）
// ============================================================================

/** 409 のときに返す現在値 */
async function currentContact(customerId: number, contactId: number) {
  const contact = await prisma.customerContact.findFirst({
    where: { id: contactId, customerId },
    select: {
      id: true,
      contactName: true,
      contactDepartment: true,
      contactPosition: true,
      contactIsRepresentative: true,
      contactIsPrimary: true,
      contactPhone: true,
      contactFax: true,
      contactEmail: true,
      contactBusinessCardFrontUrl: true,
      contactBusinessCardBackUrl: true,
      updatedAt: true,
      businessLinks: {
        select: { business: { select: { businessCode: true, businessName: true } } },
      },
    },
  });
  return contact ? buildContactItem(contact) : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const { id: customerCode, contactId } = await params;
  const contactIdNum = Number.parseInt(contactId, 10);
  // 認証前に DB を叩かないよう、対象の解決は handler の中まで遅延させる
  const resolveScope = once(() => findIntegrationCustomerByCode(prisma, customerCode));

  return handleIntegrationWrite(request, {
    scope: IDEMPOTENCY_SCOPE_ML_CONTACT,
    resourceKey: `customer:${customerCode}:contact:${contactId}`,
    logContext: 'ml-contact-write',
    onConflict: async () => {
      const scope = await resolveScope();
      return scope ? currentContact(scope.customerId, contactIdNum) : null;
    },
    handler: async ({ actor, body }) => {
      const scope = await resolveScope();
      if (!scope || Number.isNaN(contactIdNum)) return { status: 404, body: { error: 'Not found' } };

      // 楽観ロック: ML は編集前に読んだ updated_at を送る
      const expectedUpdatedAt = body.updatedAt ?? body.updated_at;
      if (expectedUpdatedAt !== undefined && typeof expectedUpdatedAt !== 'string') {
        throw ApiError.badRequest('updatedAt は ISO 8601 形式の文字列で指定してください');
      }

      // 楽観ロックのトークンは更新項目ではないので落とす
      const fields = Object.fromEntries(
        Object.entries(body).filter(([k]) => k !== 'updatedAt' && k !== 'updated_at'),
      );
      const updated = await updateCustomerContact(prisma, scope.customerId, contactIdNum, fields, actor, {
        ...(typeof expectedUpdatedAt === 'string' ? { expectedUpdatedAt } : {}),
      });

      await recordIntegrationChange(prisma, actor, {
        entityType: 'contact',
        entityId: updated.id,
        entityKey: scope.customerCode,
        action: 'update',
        changedFields: changedFieldNames(fields),
      });

      return { status: 200, body: { ...buildContactItem(updated), customer_code: scope.customerCode } };
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const { id: customerCode, contactId } = await params;
  const contactIdNum = Number.parseInt(contactId, 10);
  // 認証前に DB を叩かないよう、対象の解決は handler の中まで遅延させる
  const resolveScope = once(() => findIntegrationCustomerByCode(prisma, customerCode));

  return handleIntegrationWrite(request, {
    scope: IDEMPOTENCY_SCOPE_ML_CONTACT,
    resourceKey: `customer:${customerCode}:contact:${contactId}:delete`,
    allowEmptyBody: true,
    logContext: 'ml-contact-write',
    onConflict: async () => {
      const scope = await resolveScope();
      return scope ? currentContact(scope.customerId, contactIdNum) : null;
    },
    handler: async ({ actor, body }) => {
      const scope = await resolveScope();
      if (!scope || Number.isNaN(contactIdNum)) return { status: 404, body: { error: 'Not found' } };

      // 削除も楽観ロックの対象（ML が古い行を消さないように）。
      // DELETE は本文を持たない呼び方もあるので ?updatedAt= でも受ける
      const expectedUpdatedAt =
        (body.updatedAt as string | undefined) ??
        (body.updated_at as string | undefined) ??
        request.nextUrl.searchParams.get('updatedAt') ??
        undefined;

      await deleteCustomerContact(prisma, scope.customerId, contactIdNum, actor, {
        ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
      });

      await recordIntegrationChange(prisma, actor, {
        entityType: 'contact',
        entityId: contactIdNum,
        entityKey: scope.customerCode,
        action: 'delete',
        changedFields: [],
      });

      return { status: 204, body: null };
    },
  });
}
