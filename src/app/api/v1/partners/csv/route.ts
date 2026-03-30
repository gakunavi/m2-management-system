import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy, PARTNER_SORT_FIELDS } from '@/lib/sort-helper';
import { PARTNER_CSV_HEADERS, escapeCSV, parseCSVLine } from '@/lib/csv-helpers';

const CSV_HEADERS = PARTNER_CSV_HEADERS;

// ============================================
// GET /api/v1/partners/csv — エクスポート
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search') ?? '';
    const partnerType = searchParams.get('filter[partnerType]') || searchParams.get('partnerType') || '';
    const industryIdStr = searchParams.get('filter[industryId]') || searchParams.get('industryId') || '';
    const isActive = searchParams.get('filter[isActive]') || searchParams.get('isActive') || '';
    const sortItems = parseSortParams(searchParams, 'partnerCode');

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
              { partnerName: { contains: search, mode: 'insensitive' as const } },
              { partnerCode: { contains: search, mode: 'insensitive' as const } },
              { contacts: { some: { contactName: { contains: search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
      ...(partnerType ? { partnerType } : {}),
      ...(industryIdStr ? { industryId: parseInt(industryIdStr, 10) } : {}),
      ...(isActive !== '' ? { partnerIsActive: isActive === 'true' } : {}),
    };

    const orderBy = buildOrderBy(sortItems, PARTNER_SORT_FIELDS, [{ field: 'partnerCode', direction: 'asc' }]);

    const partners = await prisma.partner.findMany({
      where,
      orderBy,
      include: {
        industry: { select: { industryName: true } },
        parent: { select: { partnerName: true } },
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

    const headerRow = exportHeaders.map((h) => escapeCSV(h.label)).join(',');
    const rows = partners.map((p) => {
      const representative = p.contacts?.find((ct) => ct.contactIsRepresentative) ?? null;
      const primaryContact = p.contacts?.find((ct) => ct.contactIsPrimary) ?? null;

      const row: Record<string, unknown> = {
        partnerCode: p.partnerCode,
        partnerTierNumber: p.partnerTierNumber ?? '',
        partnerTier: p.partnerTier,
        parentPartnerName: p.parent?.partnerName ?? '',
        partnerName: p.partnerName,
        partnerSalutation: p.partnerSalutation,
        partnerType: p.partnerType,
        partnerPostalCode: p.partnerPostalCode,
        partnerAddress: p.partnerAddress,
        partnerPhone: p.partnerPhone,
        partnerFax: p.partnerFax,
        partnerEmail: p.partnerEmail,
        partnerWebsite: p.partnerWebsite,
        representativeName: representative?.contactName ?? '',
        representativePosition: representative?.contactPosition ?? '',
        primaryContactName: primaryContact?.contactName ?? '',
        primaryContactDepartment: primaryContact?.contactDepartment ?? '',
        primaryContactPhone: primaryContact?.contactPhone ?? '',
        primaryContactEmail: primaryContact?.contactEmail ?? '',
        industryName: p.industry?.industryName ?? '',
        partnerEstablishedDate: p.partnerEstablishedDate?.toISOString().split('T')[0] ?? '',
        partnerCorporateNumber: p.partnerCorporateNumber ?? '',
        partnerInvoiceNumber: p.partnerInvoiceNumber ?? '',
        partnerCapital: p.partnerCapital != null ? Number(p.partnerCapital).toString() : '',
        partnerFolderUrl: p.partnerFolderUrl,
        partnerNotes: p.partnerNotes,
        partnerIsActive: p.partnerIsActive ? '1' : '0',
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
      return exportHeaders.map((h) => escapeCSV(row[h.key])).join(',');
    });

    const csv = [headerRow, ...rows].join('\r\n');
    const bom = '\uFEFF';

    const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `partners_${now}.csv`;

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
// POST /api/v1/partners/csv — インポート
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
    const hasIsActiveColumn = headers.some((h) => labelToKey[h] === 'partnerIsActive');

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

          const partnerCode = row.partnerCode?.trim();
          if (!partnerCode) {
            results.errors.push(`行${lineNo}: 代理店コードが空です`);
            results.skipped++;
            continue;
          }

          const partnerName = row.partnerName?.trim();
          if (!partnerName) {
            results.errors.push(`行${lineNo}: 代理店名が空です`);
            results.skipped++;
            continue;
          }

          const industryId = row.industryName ? (industryMap.get(row.industryName) ?? null) : null;

          let partnerEstablishedDate: Date | null = null;
          if (row.partnerEstablishedDate) {
            const d = new Date(row.partnerEstablishedDate);
            if (isNaN(d.getTime())) {
              results.errors.push(`行${lineNo}: 設立日の形式が不正です（YYYY-MM-DD）: ${row.partnerEstablishedDate}`);
              results.skipped++;
              continue;
            }
            partnerEstablishedDate = d;
          }

          let partnerCapital: bigint | null = null;
          if (row.partnerCapital) {
            const trimmed = row.partnerCapital.trim().replace(/,/g, '');
            if (!/^\d+$/.test(trimmed)) {
              results.errors.push(`行${lineNo}: 資本金の値が不正です（半角数字のみ）: ${row.partnerCapital}`);
              results.skipped++;
              continue;
            }
            partnerCapital = BigInt(trimmed);
          }

          const upsertData = {
            partnerTier: row.partnerTier || null,
            partnerName,
            partnerSalutation: row.partnerSalutation || null,
            partnerType: row.partnerType || '未設定',
            partnerPostalCode: row.partnerPostalCode || null,
            partnerAddress: row.partnerAddress || null,
            partnerPhone: row.partnerPhone || null,
            partnerFax: row.partnerFax || null,
            partnerEmail: row.partnerEmail || null,
            partnerWebsite: row.partnerWebsite || null,
            industryId,
            partnerEstablishedDate,
            partnerCorporateNumber: row.partnerCorporateNumber || null,
            partnerInvoiceNumber: row.partnerInvoiceNumber || null,
            partnerCapital,
            partnerFolderUrl: row.partnerFolderUrl || null,
            partnerNotes: row.partnerNotes || null,
            updatedBy: user.id,
          };

          const existing = await tx.partner.findUnique({
            where: { partnerCode },
            select: { id: true },
          });

          let partnerId: number;
          if (existing) {
            if (mode === 'create_only') {
              results.skipped++;
              continue;
            }
            await tx.partner.update({
              where: { partnerCode },
              data: {
                ...upsertData,
                ...(hasIsActiveColumn ? { partnerIsActive: row.partnerIsActive !== '0' } : {}),
                version: { increment: 1 },
              },
            });
            partnerId = existing.id;
            results.updated++;
          } else {
            const created = await tx.partner.create({
              data: {
                partnerCode,
                ...upsertData,
                partnerIsActive: row.partnerIsActive !== '0',
                createdBy: user.id,
              },
            });
            partnerId = created.id;
            results.created++;
          }

          // 連絡先のインポート（代表者）
          const repName = row.representativeName?.trim();
          if (repName) {
            const existingRep = await tx.partnerContact.findFirst({
              where: { partnerId, contactIsRepresentative: true },
              select: { id: true },
            });
            const repData = {
              contactName: repName,
              contactPosition: row.representativePosition?.trim() || null,
            };
            if (existingRep) {
              await tx.partnerContact.update({
                where: { id: existingRep.id },
                data: repData,
              });
            } else {
              await tx.partnerContact.create({
                data: { partnerId, ...repData, contactIsRepresentative: true, contactSortOrder: 0 },
              });
            }
          }

          // 連絡先のインポート（主担当者）
          const primaryName = row.primaryContactName?.trim();
          if (primaryName) {
            const existingPrimary = await tx.partnerContact.findFirst({
              where: { partnerId, contactIsPrimary: true },
              select: { id: true },
            });
            const primaryData = {
              contactName: primaryName,
              contactDepartment: row.primaryContactDepartment?.trim() || null,
              contactPhone: row.primaryContactPhone?.trim() || null,
              contactEmail: row.primaryContactEmail?.trim() || null,
            };
            if (existingPrimary) {
              await tx.partnerContact.update({
                where: { id: existingPrimary.id },
                data: primaryData,
              });
            } else {
              await tx.partnerContact.create({
                data: { partnerId, ...primaryData, contactIsPrimary: true, contactSortOrder: 1 },
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

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    return handleApiError(error);
  }
}
