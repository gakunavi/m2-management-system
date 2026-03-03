import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { FILE_CATEGORY_TEMPLATE_COLUMNS, escapeCSV } from '@/lib/csv-helpers';

// 列ごとのヒント（入力ガイド）
const COLUMN_HINTS: Record<string, string> = {
  key: '英字始まり・英数字とアンダースコアのみ。作成後変更不可',
  sortOrder: '数値（例: 0, 1, 2）',
};

// ============================================
// GET /api/v1/businesses/:id/file-categories/csv/template — テンプレートDL
// ============================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const headerRow = FILE_CATEGORY_TEMPLATE_COLUMNS.map((c) =>
      escapeCSV(c.required ? `${c.label} *` : c.label)
    ).join(',');

    const exampleRow = FILE_CATEGORY_TEMPLATE_COLUMNS.map((c) => escapeCSV(c.example)).join(',');

    // ヒント行（入力ガイド）
    const hintRow = FILE_CATEGORY_TEMPLATE_COLUMNS.map((c) => {
      const hint = COLUMN_HINTS[c.key];
      return escapeCSV(hint ? `# ${hint}` : '');
    }).join(',');

    const csv = [headerRow, exampleRow, hintRow].join('\r\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="file_categories_template.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
