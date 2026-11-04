import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import { resolveImportBusiness } from '@/lib/customer-import';
import { customerAdminUrl } from '@/lib/integration-url';
import { logger } from '@/lib/logger';
import { findIntegrationCustomerByCode } from '@/lib/ml-scope';
import {
  handleIntegrationWrite,
  IDEMPOTENCY_SCOPE_ML_CUSTOMER,
  once,
} from '@/lib/integration-write';
import { applyCustomerUpdate } from '@/lib/customer-update';
import {
  buildMlCustomerItem,
  mlCustomerPatchSchema,
  toCustomerUpdateBody,
} from '@/lib/ml-customer-fields';
import { recordIntegrationChange } from '@/lib/integration-change-log';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/integrations/customers/{id}
//
// 読み戻し検算用。取り込み時に送った JSON と同じ形で現在値を返すので、
// 呼び出し側でそのまま突き合わせられる。
//
// ⚠️ 口座番号・口座名義を含むため、レスポンスはログに出さないこと。
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authorizeIntegrationRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const business = await resolveImportBusiness();
    if (!business) {
      logger.error(
        '連携API: 取り込み対象事業を解決できません（INTEGRATION_BUSINESS_CODE を確認してください）',
        undefined,
        'customer-import',
      );
      return NextResponse.json({ error: 'Import target business is not configured' }, { status: 500 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        customerCode: true,
        customerType: true,
        customerName: true,
        customerPostalCode: true,
        customerAddress: true,
        customerPhone: true,
        customerEmail: true,
        customerCorporateNumber: true,
        customerInvoiceNumber: true,
        customerFiscalMonth: true,
        customerEstablishedDate: true,
        customerIsActive: true,
        version: true,
        updatedAt: true,
        industry: { select: { industryName: true } },
        contacts: {
          select: {
            id: true,
            contactName: true,
            contactDepartment: true,
            contactEmail: true,
            contactIsRepresentative: true,
          },
          orderBy: [{ contactSortOrder: 'asc' }, { id: 'asc' }],
        },
        businessLinks: {
          where: { businessId: business.id },
          select: { linkCustomData: true },
        },
        bankAccounts: {
          where: { businessId: business.id },
          select: {
            bankName: true,
            branchName: true,
            accountType: true,
            accountNumber: true,
            accountHolder: true,
          },
          orderBy: { id: 'asc' },
          take: 1,
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const linkData = (customer.businessLinks[0]?.linkCustomData as Record<string, unknown> | undefined) ?? {};
    const contactRoles = (linkData.contact_roles as Record<string, string> | undefined) ?? {};
    const bank = customer.bankAccounts[0];
    const representative = customer.contacts.find((c) => c.contactIsRepresentative) ?? null;

    return NextResponse.json({
      id: customer.id,
      url: customerAdminUrl(customer.id),
      mo_no: (linkData.mo_no as string) ?? null,
      /** m2 の社内採番コード（CST-####）。MO番号とは別物 */
      customer_code: customer.customerCode,
      customer_type: customer.customerType,
      company_name: customer.customerName,
      postal_code: customer.customerPostalCode,
      address: customer.customerAddress,
      phone: customer.customerPhone,
      representative_name: representative?.contactName ?? null,
      established_on: customer.customerEstablishedDate
        ? customer.customerEstablishedDate.toISOString().slice(0, 10)
        : null,
      corporate_no: customer.customerCorporateNumber,
      invoice_no: customer.customerInvoiceNumber,
      fiscal_month: customer.customerFiscalMonth,
      industry: customer.industry?.industryName ?? null,
      industry_raw: linkData.industry_raw ?? null,
      company_email: customer.customerEmail,
      bank_name: bank?.bankName ?? null,
      branch_name: bank?.branchName ?? null,
      account_type: bank?.accountType ?? null,
      account_no: bank?.accountNumber ?? null,
      account_holder: bank?.accountHolder ?? null,
      contacts: customer.contacts
        .filter((c) => !c.contactIsRepresentative)
        .map((c) => ({
          id: c.id,
          role: contactRoles[String(c.id)] ?? null,
          name: c.contactName,
          department: c.contactDepartment,
          email: c.contactEmail,
        })),
      gbiz_id_prime: linkData.gbiz_id_prime ?? null,
      kyoka_zeisei_history: linkData.kyoka_zeisei_history ?? null,
      gratitude_addressee: linkData.gratitude_addressee ?? null,
      delivery_address: linkData.delivery_address ?? null,
      form_submitted_at: linkData.form_submitted_at ?? null,
      is_active: customer.customerIsActive,
      version: customer.version,
      updated_at: customer.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error('連携API: 顧客の読み戻しに失敗しました', error, 'customer-import');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ============================================================================
// PATCH /api/integrations/customers/{customer_code}
//
// ML管理システムからの顧客の書き戻し。**GET とは引数が違う**: GET は数値ID
// （取り込み時の読み戻し検算用・既存の挙動）、PATCH は顧客コード（CST-0001）。
// Next.js は同じ階層で別名の動的セグメントを持てないため、同じ [id] を共有して
// いる。
//
// - 認証: Authorization: Bearer <INTEGRATION_API_TOKEN>（読み取り用では 401）
// - 変更者: X-ML-User ヘッダー（変更履歴に "ML：<名前>" として残る）
// - 対象: env INTEGRATION_BUSINESS_CODE（既定 LIGHT）に紐づく顧客のみ。それ以外は 404
// - 画面と同じ更新処理（src/lib/customer-update.ts）を通る。社名＋電話の重複
//   チェックもそのまま効く
// ============================================================================

/** 409 のときに返す現在値 */
async function currentMlCustomer(customerId: number) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, customerCode: true, customerName: true, customerType: true, version: true },
  });
  if (!customer) return null;
  return buildMlCustomerItem(customer, { customerUrl: customerAdminUrl(customer.id) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customerCode } = await params;
  // 認証前に DB を叩かないよう、対象の解決は handler の中まで遅延させる
  const resolveScope = once(() => findIntegrationCustomerByCode(prisma, customerCode));

  return handleIntegrationWrite(request, {
    scope: IDEMPOTENCY_SCOPE_ML_CUSTOMER,
    resourceKey: `customer:${customerCode}`,
    logContext: 'ml-customer-write',
    onConflict: async () => {
      const scope = await resolveScope();
      return scope ? currentMlCustomer(scope.customerId) : null;
    },
    handler: async ({ actor, body }) => {
      const scope = await resolveScope();
      if (!scope) return { status: 404, body: { error: 'Not found' } };

      const input = mlCustomerPatchSchema.parse(body);

      // 画面と同じ更新処理
      const updated = await applyCustomerUpdate(prisma, {
        customerId: scope.customerId,
        body: toCustomerUpdateBody(input) as unknown as Record<string, unknown>,
        actor,
      });

      await recordIntegrationChange(prisma, actor, {
        entityType: 'customer',
        entityId: updated.id,
        entityKey: updated.customerCode,
        action: 'update',
        changedFields: Object.keys(input).filter((k) => k !== 'version').sort(),
      });

      return {
        status: 200,
        body: buildMlCustomerItem(updated, { customerUrl: customerAdminUrl(updated.id) }),
      };
    },
  });
}
