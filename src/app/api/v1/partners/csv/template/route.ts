import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { PARTNER_TEMPLATE_COLUMNS, escapeCSV } from '@/lib/csv-helpers';

// ============================================
// GET /api/v1/partners/csv/template — テンプレートDL
// ============================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const headerRow = PARTNER_TEMPLATE_COLUMNS.map((c) =>
      escapeCSV(c.required ? `${c.label} *` : c.label)
    ).join(',');

    const exampleRow = PARTNER_TEMPLATE_COLUMNS.map((c) => escapeCSV(c.example)).join(',');
    const csv = [headerRow, exampleRow].join('\r\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="partners_template.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
