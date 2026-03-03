import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { CUSTOMER_BANK_ACCOUNT_TEMPLATE_COLUMNS, escapeCSV } from '@/lib/csv-helpers';

// ============================================
// GET /api/v1/customers/csv/bank-accounts/template — テンプレートDL
// ============================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    // 必須項目に * マークを付加したヘッダー行
    const headerRow = CUSTOMER_BANK_ACCOUNT_TEMPLATE_COLUMNS.map((c) =>
      escapeCSV(c.required ? `${c.label} *` : c.label)
    ).join(',');

    const exampleRow = CUSTOMER_BANK_ACCOUNT_TEMPLATE_COLUMNS.map((c) =>
      escapeCSV(c.example)
    ).join(',');

    const csv = [headerRow, exampleRow].join('\r\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="customer_bank_accounts_template.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
