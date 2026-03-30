import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy, BUSINESS_SORT_FIELDS } from '@/lib/sort-helper';
import { BUSINESS_CSV_HEADERS, escapeCSV, parseCSVLine } from '@/lib/csv-helpers';

const CSV_HEADERS = BUSINESS_CSV_HEADERS;

// ============================================
// GET /api/v1/businesses/csv — エクスポート
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') ?? '';
    const isActive = searchParams.get('filter[isActive]') || searchParams.get('isActive') || '';
    const sortItems = parseSortParams(searchParams, 'businessSortOrder');

    const columnsParam = searchParams.get('columns');
    const exportHeaders = columnsParam
      ? (() => {
          const keys = columnsParam.split(',').filter((k) => k.trim() !== '');
          const matched = keys
            .map((k) => CSV_HEADERS.find((h) => h.key === k))
            .filter((h): h is (typeof CSV_HEADERS)[number] => h !== undefined);
          return matched.length > 0 ? matched : CSV_HEADERS;
        })()
      : CSV_HEADERS;

    const where = {
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: 'insensitive' as const } },
              { businessCode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(isActive !== '' ? { businessIsActive: isActive === 'true' } : {}),
    };

    const orderBy = buildOrderBy(sortItems, BUSINESS_SORT_FIELDS, [{ field: 'businessSortOrder', direction: 'asc' }]);

    const businesses = await prisma.business.findMany({
      where,
      orderBy,
    });

    const headerRow = exportHeaders.map((h) => escapeCSV(h.label)).join(',');
    const rows = businesses.map((b) => {
      const row: Record<string, unknown> = {
        businessCode: b.businessCode,
        businessName: b.businessName,
        businessDescription: b.businessDescription,
        businessSortOrder: b.businessSortOrder,
        businessIsActive: b.businessIsActive ? '1' : '0',
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      };
      return exportHeaders.map((h) => escapeCSV(row[h.key])).join(',');
    });

    const csv = [headerRow, ...rows].join('\r\n');
    const bom = '\uFEFF';

    const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `businesses_${now}.csv`;

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// POST /api/v1/businesses/csv — インポート
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) ?? 'upsert';
    const dryRun = formData.get('dryRun') === 'true';

    if (!file) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルが指定されていません', 400);
    }

    if (!file.name.endsWith('.csv')) {
      throw new ApiError('VALIDATION_ERROR', 'CSVファイルのみインポートできます', 400);
    }

    const text = await file.text();
    const content = text.startsWith('\uFEFF') ? text.slice(1) : text;
    const allLines = content.split(/\r?\n/).filter((l) => l.trim() !== '');

    // Numbers等がシート名を先頭行に挿入するケースに対応
    let headerLineIndex = 0;
    while (headerLineIndex < allLines.length && !allLines[headerLineIndex].includes(',')) {
      headerLineIndex++;
    }
    const lines = allLines.slice(headerLineIndex);

    if (lines.length < 2) {
      throw new ApiError('VALIDATION_ERROR', 'データ行が存在しません', 400);
    }

    const rawHeaders = parseCSVLine(lines[0]);
    const headers = rawHeaders.map((h) => h.replace(/\s*\*\s*$/, '').trim());
    const labelToKey = Object.fromEntries(CSV_HEADERS.map((h) => [h.label, h.key]));

    // isActive列がCSVに含まれるか判定（列がない場合、更新時に既存値を保持する）
    const hasIsActiveColumn = headers.some((h) => labelToKey[h] === 'businessIsActive');

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[], dryRun };

    try {
    await prisma.$transaction(async (tx) => {
      for (let i = 1; i < lines.length; i++) {
        const lineNo = headerLineIndex + i + 1;
        try {
          const values = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => {
            const key = labelToKey[h];
            if (key) row[key] = values[idx] ?? '';
          });

          const businessCode = row.businessCode?.trim();
          if (!businessCode) {
            results.errors.push(`行${lineNo}: 事業コードが空です`);
            results.skipped++;
            continue;
          }

          const businessName = row.businessName?.trim();
          if (!businessName) {
            results.errors.push(`行${lineNo}: 事業名が空です`);
            results.skipped++;
            continue;
          }

          let businessSortOrder = 0;
          if (row.businessSortOrder) {
            const parsed = parseInt(row.businessSortOrder.trim(), 10);
            if (!isNaN(parsed) && parsed >= 0) {
              businessSortOrder = parsed;
            }
          }

          const upsertData = {
            businessName,
            businessDescription: row.businessDescription || null,
            businessSortOrder,
            updatedBy: user.id,
          };

          const existing = await tx.business.findUnique({
            where: { businessCode },
            select: { id: true },
          });

          if (existing) {
            if (mode === 'create_only') {
              results.skipped++;
              continue;
            }
            await tx.business.update({
              where: { businessCode },
              data: {
                ...upsertData,
                ...(hasIsActiveColumn ? { businessIsActive: row.businessIsActive !== '0' } : {}),
                version: { increment: 1 },
              },
            });
            results.updated++;
          } else {
            await tx.business.create({
              data: {
                businessCode,
                ...upsertData,
                businessIsActive: row.businessIsActive !== '0',
                createdBy: user.id,
              },
            });
            results.created++;
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : '';
          results.errors.push(`行${lineNo}: 処理中にエラーが発生しました${detail ? `（${detail}）` : ''}`);
          results.skipped++;
        }
      }

      // ドライランの場合はトランザクションをロールバック
      if (dryRun) {
        throw { __dryRunRollback: true };
      }
    }, { timeout: 120000 });
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && '__dryRunRollback' in err) {
        // ドライラン正常終了 — results は蓄積済み
      } else {
        throw err;
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
