import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy, CUSTOMER_SORT_FIELDS } from '@/lib/sort-helper';
import { formatCustomer } from '@/lib/format-customer';
import {
  whereIn,
  whereContains,
  whereDateRange,
  whereNumberRange,
  whereBoolean,
} from '@/lib/filter-helper';

// ============================================
// 顧客コード採番ロジック
// ============================================

async function generateCustomerCode(): Promise<string> {
  const latest = await prisma.customer.findFirst({
    where: { customerCode: { startsWith: 'CST-' } },
    orderBy: { customerCode: 'desc' },
    select: { customerCode: true },
  });
  if (!latest) return 'CST-0001';
  const num = parseInt(latest.customerCode.replace('CST-', ''), 10);
  return `CST-${String(num + 1).padStart(4, '0')}`;
}

// ============================================
// 入力バリデーションスキーマ
// ============================================

const createCustomerSchema = z.object({
  customerName: z.string().min(1, '顧客名は必須です').max(200),
  customerSalutation: z.string().max(100).optional().nullable(),
  customerType: z.enum(['法人', '個人事業主', '個人', '確認中', '未設定']).default('未設定'),
  customerPostalCode: z.string().max(10).optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  customerPhone: z.string().max(20).optional().nullable(),
  customerFax: z.string().max(20).optional().nullable(),
  customerEmail: z.string().email().optional().nullable().or(z.literal('')),
  customerWebsite: z.string().url().optional().nullable().or(z.literal('')),
  industryId: z.number().int().positive().optional().nullable(),
  customerCorporateNumber: z.string().regex(/^\d{13}$/).optional().nullable().or(z.literal('')),
  customerInvoiceNumber: z.string().regex(/^T\d{13}$/).optional().nullable().or(z.literal('')),
  customerCapital: z.number().int().min(0).optional().nullable(),
  customerFiscalMonth: z.number().int().min(1).max(12).optional().nullable(),
  customerEstablishedDate: z.string().optional().nullable(),
  customerFolderUrl: z.string().url().optional().nullable().or(z.literal('')),
  customerNotes: z.string().optional().nullable(),
  customerCustomData: z.record(z.unknown()).optional().default({}),
});

// ============================================
// GET /api/v1/customers
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)));
    const search = searchParams.get('search') ?? '';
    const sortItems = parseSortParams(searchParams, 'customerCode');

    // 事業フィルター
    const businessIdParam = searchParams.get('businessId');
    const businessIdFilter = businessIdParam
      ? { businessLinks: { some: { businessId: parseInt(businessIdParam, 10), linkStatus: 'active' } } }
      : {};

    const where = {
      ...(search
        ? {
            OR: [
              { customerName: { contains: search, mode: 'insensitive' as const } },
              { customerCode: { contains: search, mode: 'insensitive' as const } },
              { contacts: { some: { contactName: { contains: search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
      ...whereIn(searchParams, 'customerType'),
      ...whereIn(searchParams, 'industryId', 'industryId', (v) => parseInt(v, 10)),
      ...whereContains(searchParams, 'customerAddress'),
      ...whereDateRange(searchParams, 'createdAt'),
      ...whereNumberRange(searchParams, 'customerCapital'),
      ...whereDateRange(searchParams, 'customerEstablishedDate'),
      ...(whereBoolean(searchParams, 'isActive', 'customerIsActive') ?? {}),
      ...businessIdFilter,
    };

    const orderBy = buildOrderBy(sortItems, CUSTOMER_SORT_FIELDS, [{ field: 'customerCode', direction: 'asc' }]);

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          industry: { select: { id: true, industryName: true } },
          contacts: {
            select: {
              id: true,
              contactName: true,
              contactDepartment: true,
              contactPosition: true,
              contactPhone: true,
              contactEmail: true,
              contactIsRepresentative: true,
              contactIsPrimary: true,
            },
            orderBy: { contactSortOrder: 'asc' },
            take: 5,
          },
          businessLinks: {
            where: { linkStatus: 'active' },
            select: { businessId: true, linkCustomData: true },
          },
        },
      }),
    ]);

    const businessIdNum = businessIdParam ? parseInt(businessIdParam, 10) : undefined;

    return NextResponse.json({
      success: true,
      data: customers.map((c) => formatCustomer(c, businessIdNum)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/customers
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const body = await request.json();

    // linkCustomData / businessId をスキーマ外で先に取り出す
    const linkCustomData = body.linkCustomData as Record<string, unknown> | undefined;
    const linkBusinessId = body.businessId as number | undefined;

    const data = createCustomerSchema.parse(body);

    // 名前+電話番号の完全一致 重複チェック
    if (data.customerPhone) {
      const duplicate = await prisma.customer.findFirst({
        where: {
          customerIsActive: true,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
        },
        select: { id: true, customerCode: true, customerName: true },
      });
      if (duplicate) {
        throw ApiError.conflict(
          `同名+同電話番号の顧客が既に存在します（${duplicate.customerCode}: ${duplicate.customerName}）`,
        );
      }
    }

    const customerCode = await generateCustomerCode();

    // 事業IDが指定されている場合は事業の存在確認
    if (linkBusinessId) {
      const business = await prisma.business.findUnique({
        where: { id: linkBusinessId },
        select: { id: true, businessIsActive: true },
      });
      if (!business || !business.businessIsActive) {
        throw ApiError.notFound('指定された事業が見つかりません');
      }
    }

    const customer = await prisma.customer.create({
      data: {
        customerCode,
        customerName: data.customerName,
        customerSalutation: data.customerSalutation ?? null,
        customerType: data.customerType,
        customerPostalCode: data.customerPostalCode ?? null,
        customerAddress: data.customerAddress ?? null,
        customerPhone: data.customerPhone ?? null,
        customerFax: data.customerFax ?? null,
        customerEmail: data.customerEmail || null,
        customerWebsite: data.customerWebsite || null,
        industryId: data.industryId ?? null,
        customerCorporateNumber: data.customerCorporateNumber || null,
        customerInvoiceNumber: data.customerInvoiceNumber || null,
        customerCapital: data.customerCapital != null ? BigInt(data.customerCapital) : null,
        customerFiscalMonth: data.customerFiscalMonth ?? null,
        customerEstablishedDate: data.customerEstablishedDate ? new Date(data.customerEstablishedDate) : null,
        customerFolderUrl: data.customerFolderUrl || null,
        customerNotes: data.customerNotes ?? null,
        customerCustomData: (data.customerCustomData ?? {}) as object,
        createdBy: user.id,
        updatedBy: user.id,
      },
      include: {
        industry: { select: { id: true, industryName: true } },
        businessLinks: {
          where: { linkStatus: 'active' },
          select: { businessId: true, linkCustomData: true },
        },
      },
    });

    // 事業IDが指定されている場合は CustomerBusinessLink を作成/更新
    if (linkBusinessId) {
      const existingLink = await prisma.customerBusinessLink.findUnique({
        where: { customerId_businessId: { customerId: customer.id, businessId: linkBusinessId } },
      });
      if (existingLink) {
        if (linkCustomData && Object.keys(linkCustomData).length > 0) {
          const existingData = (existingLink.linkCustomData as Record<string, unknown>) ?? {};
          await prisma.customerBusinessLink.update({
            where: { id: existingLink.id },
            data: {
              linkCustomData: { ...existingData, ...linkCustomData } as unknown as import('@prisma/client').Prisma.InputJsonValue,
            },
          });
        }
      } else {
        await prisma.customerBusinessLink.create({
          data: {
            customerId: customer.id,
            businessId: linkBusinessId,
            linkStatus: 'active',
            linkCustomData: (linkCustomData ?? {}) as unknown as import('@prisma/client').Prisma.InputJsonValue,
          },
        });
      }
      // businessLinks を再取得して反映
      const freshLinks = await prisma.customerBusinessLink.findMany({
        where: { customerId: customer.id, linkStatus: 'active' },
        select: { businessId: true, linkCustomData: true },
      });
      (customer as Record<string, unknown>).businessLinks = freshLinks;
    }

    return NextResponse.json({ success: true, data: formatCustomer(customer, linkBusinessId) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
