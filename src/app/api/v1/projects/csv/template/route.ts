import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { escapeCSV } from '@/lib/csv-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// 固定テンプレート列
const FIXED_TEMPLATE_COLUMNS = [
  { label: '顧客コード', required: true, example: 'CST-0001' },
  { label: '顧客名', required: false, example: '株式会社サンプル' },
  { label: '代理店コード', required: false, example: 'AG-0001' },
  { label: '代理店名', required: false, example: '株式会社サンプル代理店' },
  { label: '営業ステータス', required: true, example: '' },
  { label: '受注予定月', required: false, example: '2026-06' },
  { label: '担当者名', required: false, example: '田中太郎' },
  { label: '備考', required: false, example: '初回提案予定' },
];

// ============================================
// GET /api/v1/projects/csv/template — テンプレートDL
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const businessIdParam = searchParams.get('businessId');
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;

    // ステータス定義を全件取得（テンプレートのヒント行に使用）
    let statusLabels: string[] = [];
    let statusExample = '';
    if (businessId && !isNaN(businessId)) {
      const statusDefs = await prisma.businessStatusDefinition.findMany({
        where: { businessId, statusIsActive: true },
        orderBy: { statusSortOrder: 'asc' },
        select: { statusLabel: true },
      });
      statusLabels = statusDefs.map((s) => s.statusLabel);
      statusExample = statusLabels[0] ?? '';
    }

    // 動的フィールドの取得
    let dynamicColumns: { label: string; required: boolean; example: string; hint: string }[] = [];
    if (businessId && !isNaN(businessId)) {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { businessConfig: true },
      });
      const config = business?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
      const fields = (config?.projectFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
      dynamicColumns = fields.map((f) => ({
        label: f.label,
        required: f.required ?? false,
        example: f.type === 'checkbox' ? '1' : f.type === 'number' ? '0' : '',
        hint:
          f.type === 'checkbox'
            ? '1=ON, 0=OFF'
            : f.type === 'number'
              ? '数値'
              : f.type === 'date'
                ? 'YYYY-MM-DD'
                : f.type === 'month'
                  ? 'YYYY-MM'
                  : f.type === 'select' && f.options?.length
                    ? f.options.join(' / ')
                    : '',
      }));
    }

    // ステータス例を注入
    const fixedColumns = FIXED_TEMPLATE_COLUMNS.map((c) =>
      c.label === '営業ステータス' ? { ...c, example: statusExample } : c,
    );

    // 固定列にヒントを追加
    const fixedColumnsWithHint = fixedColumns.map((c) => ({
      ...c,
      hint:
        c.label === '顧客コード'
          ? '必須（顧客名でも検索可）'
          : c.label === '営業ステータス' && statusLabels.length > 0
            ? `利用可能値: ${statusLabels.join(' / ')}`
            : c.label === '受注予定月'
              ? 'YYYY-MM形式'
              : c.label === '代理店コード'
                ? '代理店名でも検索可'
                : '',
    }));

    const allColumns = [...fixedColumnsWithHint, ...dynamicColumns];

    const headerRow = allColumns
      .map((c) => escapeCSV(c.required ? `${c.label} *` : c.label))
      .join(',');
    const exampleRow = allColumns.map((c) => escapeCSV(c.example)).join(',');

    // ヒント行（入力ガイド）— 列ごとの説明や利用可能値を表示
    const hasHints = allColumns.some((c) => c.hint);
    const hintRow = hasHints
      ? allColumns.map((c) => escapeCSV(c.hint ? `# ${c.hint}` : '')).join(',')
      : null;

    const csvRows = [headerRow, exampleRow];
    if (hintRow) csvRows.push(hintRow);
    const csv = csvRows.join('\r\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="projects_template.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
