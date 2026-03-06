import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy, CUSTOMER_SORT_FIELDS } from '@/lib/sort-helper';
import { CUSTOMER_CSV_HEADERS, escapeCSV, parseCSVLine } from '@/lib/csv-helpers';

const CSV_HEADERS = CUSTOMER_CSV_HEADERS;

// ============================================
// GET /api/v1/customers/csv — エクスポート
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') ?? '';
    const customerType = searchParams.get('filter[customerType]') || searchParams.get('customerType') || '';
    const industryIdStr = searchParams.get('filter[industryId]') || searchParams.get('industryId') || '';
    const isActive = searchParams.get('filter[isActive]') || searchParams.get('isActive') || '';
    const sortItems = parseSortParams(searchParams, 'customerCode');

    // エクスポート対象列（columns パラメータ指定時はその列のみ、未指定時は全列）
    const columnsParam = searchParams.get('columns');
    const exportHeaders = columnsParam
      ? (() => {
          const keys = columnsParam.split(',').filter((k) => k.trim() !== '');
          // 指定順序を維持する。マッチしないキーは無視、結果が空なら全列にフォールバック
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
              { customerName: { contains: search, mode: 'insensitive' as const } },
              { customerCode: { contains: search, mode: 'insensitive' as const } },
              { contacts: { some: { contactName: { contains: search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
      ...(customerType ? { customerType } : {}),
      ...(industryIdStr ? { industryId: parseInt(industryIdStr, 10) } : {}),
      ...(isActive !== '' ? { customerIsActive: isActive === 'true' } : { customerIsActive: true }),
    };

    const orderBy = buildOrderBy(sortItems, CUSTOMER_SORT_FIELDS, [{ field: 'customerCode', direction: 'asc' }]);

    const customers = await prisma.customer.findMany({
      where,
      orderBy,
      include: {
        industry: { select: { industryName: true } },
        contacts: {
          select: {
            contactName: true,
            contactDepartment: true,
            contactPosition: true,
            contactPhone: true,
            contactEmail: true,
            contactIsRepresentative: true,
            contactIsPrimary: true,
          },
          orderBy: { contactSortOrder: 'asc' },
        },
      },
    });

    // CSV 生成（exportHeaders に従い列を出力）
    const headerRow = exportHeaders.map((h) => escapeCSV(h.label)).join(',');
    const rows = customers.map((c) => {
      const representative = c.contacts?.find((ct) => ct.contactIsRepresentative) ?? null;
      const primaryContact = c.contacts?.find((ct) => ct.contactIsPrimary) ?? null;

      const row: Record<string, unknown> = {
        customerCode: c.customerCode,
        customerName: c.customerName,
        customerSalutation: c.customerSalutation,
        customerType: c.customerType,
        representativeName: representative?.contactName ?? '',
        representativePosition: representative?.contactPosition ?? '',
        primaryContactName: primaryContact?.contactName ?? '',
        primaryContactDepartment: primaryContact?.contactDepartment ?? '',
        primaryContactPhone: primaryContact?.contactPhone ?? '',
        primaryContactEmail: primaryContact?.contactEmail ?? '',
        customerPostalCode: c.customerPostalCode,
        customerAddress: c.customerAddress,
        customerPhone: c.customerPhone,
        customerFax: c.customerFax,
        customerEmail: c.customerEmail,
        customerWebsite: c.customerWebsite,
        industryName: c.industry?.industryName ?? '',
        customerCorporateNumber: c.customerCorporateNumber,
        customerInvoiceNumber: c.customerInvoiceNumber,
        customerCapital: c.customerCapital !== null ? Number(c.customerCapital) : '',
        customerFiscalMonth: c.customerFiscalMonth ?? '',
        customerEstablishedDate: c.customerEstablishedDate?.toISOString().split('T')[0] ?? '',
        customerFolderUrl: c.customerFolderUrl,
        customerNotes: c.customerNotes,
        customerIsActive: c.customerIsActive ? '1' : '0',
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
      return exportHeaders.map((h) => escapeCSV(row[h.key])).join(',');
    });

    const csv = [headerRow, ...rows].join('\r\n');
    const bom = '\uFEFF'; // BOM (Excel で文字化け防止)

    const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `customers_${now}.csv`;

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
// POST /api/v1/customers/csv — インポート
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
    const hasIsActiveColumn = headers.some((h) => labelToKey[h] === 'customerIsActive');

    // 読み取り専用クエリはトランザクション外で実行
    const industries = await prisma.industry.findMany({
      select: { id: true, industryName: true },
    });
    const industryMap = new Map(industries.map((i) => [i.industryName, i.id]));

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

          const customerCode = row.customerCode?.trim();
          if (!customerCode) {
            results.errors.push(`行${lineNo}: 顧客コードが空です`);
            results.skipped++;
            continue;
          }

          const customerName = row.customerName?.trim();
          if (!customerName) {
            results.errors.push(`行${lineNo}: 顧客名が空です`);
            results.skipped++;
            continue;
          }

          const industryId = row.industryName
            ? (industryMap.get(row.industryName) ?? null)
            : null;

          let customerCapital: bigint | null = null;
          if (row.customerCapital) {
            const trimmed = row.customerCapital.trim().replace(/,/g, '');
            if (!/^\d+$/.test(trimmed)) {
              results.errors.push(`行${lineNo}: 資本金の値が不正です（半角数字のみ）: ${row.customerCapital}`);
              results.skipped++;
              continue;
            }
            customerCapital = BigInt(trimmed);
          }

          let customerFiscalMonth: number | null = null;
          if (row.customerFiscalMonth) {
            const fm = parseInt(row.customerFiscalMonth.trim(), 10);
            if (isNaN(fm) || fm < 1 || fm > 12) {
              results.errors.push(`行${lineNo}: 決算月の値が不正です（1〜12）: ${row.customerFiscalMonth}`);
              results.skipped++;
              continue;
            }
            customerFiscalMonth = fm;
          }

          let customerEstablishedDate: Date | null = null;
          if (row.customerEstablishedDate) {
            const d = new Date(row.customerEstablishedDate);
            if (isNaN(d.getTime())) {
              results.errors.push(`行${lineNo}: 設立日の形式が不正です（YYYY-MM-DD）: ${row.customerEstablishedDate}`);
              results.skipped++;
              continue;
            }
            customerEstablishedDate = d;
          }

          const upsertData = {
            customerName,
            customerSalutation: row.customerSalutation || null,
            customerType: row.customerType || '未設定',
            customerPostalCode: row.customerPostalCode || null,
            customerAddress: row.customerAddress || null,
            customerPhone: row.customerPhone || null,
            customerFax: row.customerFax || null,
            customerEmail: row.customerEmail || null,
            customerWebsite: row.customerWebsite || null,
            industryId,
            customerCorporateNumber: row.customerCorporateNumber || null,
            customerInvoiceNumber: row.customerInvoiceNumber || null,
            customerCapital,
            customerFiscalMonth,
            customerEstablishedDate,
            customerFolderUrl: row.customerFolderUrl || null,
            customerNotes: row.customerNotes || null,
            updatedBy: user.id,
          };

          const existing = await tx.customer.findUnique({
            where: { customerCode },
            select: { id: true },
          });

          let customerId: number;
          if (existing) {
            if (mode === 'create_only') {
              results.skipped++;
              continue;
            }
            await tx.customer.update({
              where: { customerCode },
              data: {
                ...upsertData,
                ...(hasIsActiveColumn ? { customerIsActive: row.customerIsActive !== '0' } : {}),
                version: { increment: 1 },
              },
            });
            customerId = existing.id;
            results.updated++;
          } else {
            const created = await tx.customer.create({
              data: {
                customerCode,
                ...upsertData,
                customerIsActive: row.customerIsActive !== '0',
                createdBy: user.id,
              },
            });
            customerId = created.id;
            results.created++;
          }

          // 連絡先のインポート（代表者）
          const repName = row.representativeName?.trim();
          if (repName) {
            const existingRep = await tx.customerContact.findFirst({
              where: { customerId, contactIsRepresentative: true },
              select: { id: true },
            });
            const repData = {
              contactName: repName,
              contactPosition: row.representativePosition?.trim() || null,
            };
            if (existingRep) {
              await tx.customerContact.update({
                where: { id: existingRep.id },
                data: repData,
              });
            } else {
              await tx.customerContact.create({
                data: { customerId, ...repData, contactIsRepresentative: true, contactSortOrder: 0 },
              });
            }
          }

          // 連絡先のインポート（主担当者）
          const primaryName = row.primaryContactName?.trim();
          if (primaryName) {
            const existingPrimary = await tx.customerContact.findFirst({
              where: { customerId, contactIsPrimary: true },
              select: { id: true },
            });
            const primaryData = {
              contactName: primaryName,
              contactDepartment: row.primaryContactDepartment?.trim() || null,
              contactPhone: row.primaryContactPhone?.trim() || null,
              contactEmail: row.primaryContactEmail?.trim() || null,
            };
            if (existingPrimary) {
              await tx.customerContact.update({
                where: { id: existingPrimary.id },
                data: primaryData,
              });
            } else {
              await tx.customerContact.create({
                data: { customerId, ...primaryData, contactIsPrimary: true, contactSortOrder: 1 },
              });
            }
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

