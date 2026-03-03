import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { PROJECT_FIELD_TEMPLATE_COLUMNS, escapeCSV } from '@/lib/csv-helpers';

// 列ごとのヒント（入力ガイド）
const COLUMN_HINTS: Record<string, string> = {
  key: '英小文字・数字・アンダースコア',
  type: '有効な値: テキスト / テキストエリア / 数値 / 日付 / 年月 / 選択 / チェックボックス / URL',
  options: '型=選択のとき、カンマ区切りで指定',
  required: '1=必須, 0=任意',
  visibleToPartner: '1=表示, 0=非表示',
};

// ============================================
// GET /api/v1/businesses/:id/project-fields/csv/template — テンプレートDL
// ============================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const headerRow = PROJECT_FIELD_TEMPLATE_COLUMNS.map((c) =>
      escapeCSV(c.required ? `${c.label} *` : c.label)
    ).join(',');

    const exampleRow = PROJECT_FIELD_TEMPLATE_COLUMNS.map((c) => escapeCSV(c.example)).join(',');

    // ヒント行（入力ガイド）
    const hintRow = PROJECT_FIELD_TEMPLATE_COLUMNS.map((c) => {
      const hint = COLUMN_HINTS[c.key];
      return escapeCSV(hint ? `# ${hint}` : '');
    }).join(',');

    const csv = [headerRow, exampleRow, hintRow].join('\r\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="project_fields_template.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
