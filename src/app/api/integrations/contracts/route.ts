import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import { resolveImportBusiness, pickBankAccountForBusiness } from '@/lib/customer-import';
import { customerAdminUrl, projectAdminUrl } from '@/lib/integration-url';
import { injectFormulaValues } from '@/lib/revenue-helpers';
import { logger } from '@/lib/logger';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';
import {
  buildContractItem,
  encodeCursor,
  parseContractQuery,
  type ContractCursor,
} from '@/lib/contract-read';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/integrations/contracts?status=purchased&limit=100
//
// 契約マスタ（案件）の読み出し専用API。毎週の Google スプレッドシート転記用。
//
// - 認証: Authorization: Bearer <INTEGRATION_READONLY_TOKEN>（書き込み用とは別トークン）
// - 対象事業: env INTEGRATION_BUSINESS_CODE（既定 LIGHT）
// - 1件 = 1案件（契約）。1顧客が複数案件を持つため mo_no は重複しうる
// - 読み取り専用。DB への書き込み・スキーマ変更は一切行わない
// - 口座番号・法人番号は平文で返す（事務が振込に使うため）。ログには出さない
// ============================================================================

export async function GET(request: NextRequest) {
  const auth = authorizeIntegrationRequest(request, 'read');
  if (!auth.ok) return auth.response;

  try {
    const business = await resolveImportBusiness();
    if (!business) {
      logger.error(
        '連携API(contracts): 対象事業を解決できません（INTEGRATION_BUSINESS_CODE を確認してください）',
        undefined,
        'contracts-read',
      );
      return NextResponse.json({ error: 'Target business is not configured' }, { status: 500 });
    }

    // --- ステータス定義（コードの妥当性チェックとラベル解決に使う） ---------
    const statusDefs = await prisma.businessStatusDefinition.findMany({
      where: { businessId: business.id },
      select: { statusCode: true, statusLabel: true },
      orderBy: { statusSortOrder: 'asc' },
    });
    const statusLabels = new Map(statusDefs.map((s) => [s.statusCode, s.statusLabel]));

    const parsed = parseContractQuery(request.nextUrl.searchParams, statusDefs);
    if (!parsed.ok) {
      return NextResponse.json({ error: 'Validation failed', errors: parsed.errors }, { status: 422 });
    }
    const { status, updatedSince, moNo, limit, cursor } = parsed.value;

    // --- mo_no 指定なら顧客を先に特定 --------------------------------------
    let moNoCustomerIds: number[] | null = null;
    if (moNo) {
      const links = await prisma.customerBusinessLink.findMany({
        where: { businessId: business.id, linkCustomData: { path: ['mo_no'], equals: moNo } },
        select: { customerId: true },
      });
      moNoCustomerIds = links.map((l) => l.customerId);
      if (moNoCustomerIds.length === 0) {
        return NextResponse.json({
          meta: { count: 0, excluded_inactive_projects: 0, excluded_inactive_customers: 0 },
          items: [],
          next_cursor: null,
        });
      }
    }

    // 絞り込み条件（有効/無効の除外は別に数えるのでここには入れない）
    const baseWhere = {
      businessId: business.id,
      ...(status ? { projectSalesStatus: status } : {}),
      ...(updatedSince ? { projectStatusChangedAt: { gte: updatedSince } } : {}),
      ...(moNoCustomerIds ? { customerId: { in: moNoCustomerIds } } : {}),
    };

    // --- 除外件数（黙って消えると気づけないので meta で返す） ---------------
    const [excludedInactiveProjects, excludedInactiveCustomers] = await Promise.all([
      prisma.project.count({ where: { ...baseWhere, projectIsActive: false } }),
      prisma.project.count({
        where: { ...baseWhere, projectIsActive: true, customer: { customerIsActive: false } },
      }),
    ]);

    const where = {
      ...baseWhere,
      projectIsActive: true,
      customer: { customerIsActive: true },
    };

    // --- 本体（キーセットページング: status_changed_at → id の昇順） -------
    const rows = await prisma.project.findMany({
      where: cursor ? { AND: [where, cursorCondition(cursor)] } : where,
      orderBy: [{ projectStatusChangedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1, // 次ページの有無を見るため1件多く取る
      select: {
        id: true,
        projectNo: true,
        projectSalesStatus: true,
        projectStatusChangedAt: true,
        projectAssignedUserName: true,
        projectNotes: true,
        projectCustomData: true,
        customer: {
          select: {
            id: true,
            customerCode: true,
            customerName: true,
            customerSalutation: true,
            customerType: true,
            customerPostalCode: true,
            customerAddress: true,
            customerPhone: true,
            customerCorporateNumber: true,
            customerInvoiceNumber: true,
            customerFiscalMonth: true,
            businessLinks: {
              where: { businessId: business.id },
              select: { linkCustomData: true },
              take: 1,
            },
            contacts: {
              select: {
                contactName: true,
                contactPhone: true,
                contactEmail: true,
                contactIsRepresentative: true,
                contactIsPrimary: true,
              },
              orderBy: [{ contactSortOrder: 'asc' }, { id: 'asc' }],
            },
            bankAccounts: {
              where: { OR: [{ businessId: business.id }, { businessId: null }] },
              select: {
                id: true,
                businessId: true,
                bankName: true,
                branchName: true,
                accountType: true,
                accountNumber: true,
                accountHolder: true,
              },
              orderBy: { id: 'asc' },
            },
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // 購入金額は数式フィールド（購入単価 × 台数）なので、保存値ではなく
    // 画面と同じ計算結果を返す
    const businessConfig = await prisma.business.findUnique({
      where: { id: business.id },
      select: { businessConfig: true },
    });
    const projectFields =
      ((businessConfig?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null)
        ?.projectFields ?? []);
    injectFormulaValues(page, projectFields);

    const items = page.map((row) =>
      buildContractItem(row, {
        businessId: business.id,
        statusLabel: statusLabels.get(row.projectSalesStatus) ?? row.projectSalesStatus,
        projectUrl: projectAdminUrl(row.id),
        customerUrl: customerAdminUrl(row.customer.id),
        pickBankAccount: pickBankAccountForBusiness,
      }),
    );

    const last = page[page.length - 1];
    return NextResponse.json({
      meta: {
        count: items.length,
        excluded_inactive_projects: excludedInactiveProjects,
        excluded_inactive_customers: excludedInactiveCustomers,
      },
      items,
      next_cursor: hasMore && last ? encodeCursor({ t: last.projectStatusChangedAt, id: last.id }) : null,
    });
  } catch (error) {
    // 口座番号を含むデータを扱うため、エラー内容以外は出さない
    logger.error('連携API(contracts): 契約の読み出しに失敗しました', error, 'contracts-read');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * カーソル以降の行に絞る条件。
 * 並びは status_changed_at 昇順 → id 昇順で、PostgreSQL の昇順では NULL が最後に来る。
 * そのため「NULL のページに入った後」は id だけで進める。
 */
function cursorCondition(cursor: ContractCursor) {
  if (cursor.t === null) {
    return { projectStatusChangedAt: null, id: { gt: cursor.id } };
  }
  return {
    OR: [
      { projectStatusChangedAt: { gt: cursor.t } },
      { projectStatusChangedAt: cursor.t, id: { gt: cursor.id } },
      { projectStatusChangedAt: null },
    ],
  };
}
