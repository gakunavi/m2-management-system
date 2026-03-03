import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { KPI_DEFINITION_TEMPLATE_COLUMNS, escapeCSV } from '@/lib/csv-helpers';

// 列ごとのヒント（入力ガイド）
const COLUMN_HINTS: Record<string, string> = {
  key: '英小文字・数字・アンダースコア',
  aggregation: '有効な値: 合計 / カウント',
  sourceField: '案件カスタムフィールドのキー（集計方法=合計のとき必須）',
  dateField: '受注予定月=projectExpectedCloseMonth、またはカスタムフィールドキー',
  isPrimary: '1=プライマリ（1件のみ）, 0=通常',
};

// ============================================
// GET /api/v1/businesses/:id/kpi-definitions/csv/template — テンプレートDL
// ============================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const headerRow = KPI_DEFINITION_TEMPLATE_COLUMNS.map((c) =>
      escapeCSV(c.required ? `${c.label} *` : c.label)
    ).join(',');

    const exampleRow = KPI_DEFINITION_TEMPLATE_COLUMNS.map((c) => escapeCSV(c.example)).join(',');

    // ヒント行（入力ガイド）
    const hintRow = KPI_DEFINITION_TEMPLATE_COLUMNS.map((c) => {
      const hint = COLUMN_HINTS[c.key];
      return escapeCSV(hint ? `# ${hint}` : '');
    }).join(',');

    const csv = [headerRow, exampleRow, hintRow].join('\r\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="kpi_definitions_template.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
