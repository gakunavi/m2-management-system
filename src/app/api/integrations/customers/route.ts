import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import { resolveImportBusiness } from '@/lib/customer-import';
import { customerAdminUrl } from '@/lib/integration-url';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/integrations/customers?mo_no=MO-79
//                               ?corporate_no=1234567890123
//                               ?company_email=xxx@example.co.jp
//
// 取り込み前の照合用。mo_no が主キー相当（事業別カスタムフィールド MO番号）。
// 複数指定した場合は mo_no → corporate_no → company_email の優先順位で1つだけ使う。
// ============================================================================

const MAX_MATCHES = 20;

export async function GET(request: NextRequest) {
  const auth = authorizeIntegrationRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = request.nextUrl;
    const moNo = searchParams.get('mo_no')?.trim();
    const corporateNo = searchParams.get('corporate_no')?.trim();
    const companyEmail = searchParams.get('company_email')?.trim();

    if (!moNo && !corporateNo && !companyEmail) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          errors: [
            {
              field: '(query)',
              message: 'mo_no / corporate_no / company_email のいずれかを指定してください',
            },
          ],
        },
        { status: 422 },
      );
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

    let matchedBy: string;
    let customerIds: number[] | null = null;
    let where: Record<string, unknown> = {};

    if (moNo) {
      matchedBy = 'mo_no';
      // MO番号は事業別カスタムデータに入っているため、リンク経由で引く
      const links = await prisma.customerBusinessLink.findMany({
        where: { businessId: business.id, linkCustomData: { path: ['mo_no'], equals: moNo } },
        select: { customerId: true },
        take: MAX_MATCHES,
      });
      customerIds = links.map((l) => l.customerId);
      where = { id: { in: customerIds } };
    } else if (corporateNo) {
      matchedBy = 'corporate_no';
      where = { customerCorporateNumber: corporateNo };
    } else {
      matchedBy = 'company_email';
      where = { customerEmail: companyEmail };
    }

    if (customerIds !== null && customerIds.length === 0) {
      return NextResponse.json({ matched_by: matchedBy, matches: [] });
    }

    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        customerName: true,
        customerCode: true,
        customerCorporateNumber: true,
        customerEmail: true,
        customerIsActive: true,
        businessLinks: {
          where: { businessId: business.id },
          select: { linkCustomData: true },
        },
      },
      take: MAX_MATCHES,
      orderBy: { id: 'asc' },
    });

    return NextResponse.json({
      matched_by: matchedBy,
      matches: customers.map((c) => {
        const linkData = (c.businessLinks[0]?.linkCustomData as Record<string, unknown>) ?? {};
        return {
          id: c.id,
          mo_no: (linkData.mo_no as string) ?? null,
          company_name: c.customerName,
          customer_code: c.customerCode,
          corporate_no: c.customerCorporateNumber,
          company_email: c.customerEmail,
          is_active: c.customerIsActive,
          url: customerAdminUrl(c.id),
        };
      }),
    });
  } catch (error) {
    logger.error('連携API: 顧客検索に失敗しました', error, 'customer-import');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
