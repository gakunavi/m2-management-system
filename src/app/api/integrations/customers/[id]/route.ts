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
  assertCustomFieldsWritable,
  mlCustomerPatchSchema,
  toCustomerUpdateBody,
} from '@/lib/ml-customer-fields';
import {
  CUSTOMER_READ_ONLY_LINK_KEYS,
  loadCustomerFieldDefinitions,
  readMlCustomer,
  resolveIndustryId,
} from '@/lib/ml-customer-read';
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
// いる。顧客コードでの読み出しは別の道（by-code/{customer_code}）にある。
//
// - 認証: Authorization: Bearer <INTEGRATION_API_TOKEN>（読み取り用では 401）
// - 変更者: X-ML-User ヘッダー（変更履歴に "ML：<名前>" として残る）
// - 対象: env INTEGRATION_BUSINESS_CODE（既定 LIGHT）に紐づく顧客のみ。それ以外は 404
// - 画面と同じ更新処理（src/lib/customer-update.ts）を通る。社名＋電話の重複
//   チェックもそのまま効く
// - 受け付ける項目は顧客の画面で人が直せるもの全部（口座・顧客コード・MO番号を除く）。
//   対応は src/lib/ml-customer-fields.ts に一覧がある
// - レスポンスは読み出し（by-code）と同じ形。ML が行全体を置き換えても欄が消えない
// ============================================================================

/** 変更履歴に残す項目名。カスタム項目は `custom_fields.<キー>` まで展開する（値は残さない） */
function changedFieldNames(input: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === 'version') continue;
    if ((key === 'custom_fields' || key === 'global_custom_fields') && value && typeof value === 'object') {
      for (const childKey of Object.keys(value as Record<string, unknown>)) {
        names.push(`${key}.${childKey}`);
      }
      continue;
    }
    names.push(key);
  }
  return names.sort();
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawCustomerCode } = await params;
  const customerCode = decodeURIComponent(rawCustomerCode);
  // 認証前に DB を叩かないよう、対象の解決は handler の中まで遅延させる
  const resolveScope = once(() => findIntegrationCustomerByCode(prisma, customerCode));

  return handleIntegrationWrite(request, {
    scope: IDEMPOTENCY_SCOPE_ML_CUSTOMER,
    resourceKey: `customer:${customerCode}`,
    logContext: 'ml-customer-write',
    onConflict: async () => {
      const scope = await resolveScope();
      if (!scope) return null;
      return readMlCustomer(prisma, {
        customerId: scope.customerId,
        businessId: scope.businessId,
      });
    },
    handler: async ({ actor, body }) => {
      const scope = await resolveScope();
      if (!scope) return { status: 404, body: { error: 'Not found' } };

      const input = mlCustomerPatchSchema.parse(body);

      // カスタム項目は定義と突き合わせる（未定義キー・計算項目・MO番号・型違いは 422）
      if (input.custom_fields !== undefined || input.global_custom_fields !== undefined) {
        const defs = await loadCustomerFieldDefinitions(prisma, scope.businessId);
        if (input.custom_fields !== undefined) {
          assertCustomFieldsWritable(input.custom_fields, defs.link, {
            scope: 'custom_fields',
            readOnlyKeys: CUSTOMER_READ_ONLY_LINK_KEYS,
          });
        }
        if (input.global_custom_fields !== undefined) {
          assertCustomFieldsWritable(input.global_custom_fields, defs.global, {
            scope: 'global_custom_fields',
          });
        }
      }

      // 業種は名前で届く。登録されていない名前は 422（選べる値を添えて返す）
      const industryId =
        input.industry !== undefined ? await resolveIndustryId(prisma, input.industry) : undefined;

      // 画面と同じ更新処理
      const updated = await applyCustomerUpdate(prisma, {
        customerId: scope.customerId,
        body: toCustomerUpdateBody(input, { businessId: scope.businessId, industryId }),
        actor,
      });

      await recordIntegrationChange(prisma, actor, {
        entityType: 'customer',
        entityId: updated.id,
        entityKey: updated.customerCode,
        action: 'update',
        changedFields: changedFieldNames(input),
      });

      const item = await readMlCustomer(prisma, {
        customerId: updated.id,
        businessId: scope.businessId,
      });
      // 直後に読めないのは想定外（更新は成功している）。500 で気づけるようにする
      if (!item) throw new Error(`更新後の顧客を読み出せませんでした: ${updated.customerCode}`);

      return { status: 200, body: item };
    },
  });
}
