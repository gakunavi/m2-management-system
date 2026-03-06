import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { STATUS_DEFINITION_TEMPLATE_COLUMNS, parseCSVLine } from '@/lib/csv-helpers';

// ============================================
// POST /api/v1/businesses/:id/status-definitions/csv — インポート
// ============================================

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await context.params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

    // 事業の存在確認
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessIsActive: true },
    });
    if (!business || !business.businessIsActive) throw ApiError.notFound('事業が見つかりません');

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

    // ラベル → キー マッピング（* 付きラベルにも対応）
    const labelToKey = Object.fromEntries(
      STATUS_DEFINITION_TEMPLATE_COLUMNS.map((c) => [c.label, c.key])
    );

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[], dryRun };

    // CSV から解析した行データを収集（バリデーション込み）
    interface ParsedRow {
      lineNo: number;
      statusCode: string;
      statusLabel: string;
      statusPriority: number;
      statusColor: string | null;
      statusIsFinal: boolean;
      statusIsLost: boolean;
      statusSortOrder: number;
      statusIsActive: boolean;
    }

    const parsedRows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const lineNo = headerLineIndex + i + 1;
      const values = parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const key = labelToKey[h];
        if (key) row[key] = values[idx] ?? '';
      });

      const statusCode = row.statusCode?.trim();
      if (!statusCode) {
        results.errors.push(`行${lineNo}: ステータスコードが空です`);
        results.skipped++;
        continue;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(statusCode)) {
        results.errors.push(`行${lineNo}: ステータスコードは英数字とアンダースコアのみ使用できます（値: ${statusCode}）`);
        results.skipped++;
        continue;
      }

      const statusLabel = row.statusLabel?.trim();
      if (!statusLabel) {
        results.errors.push(`行${lineNo}: 表示ラベルが空です`);
        results.skipped++;
        continue;
      }

      const statusPriority = row.statusPriority ? parseInt(row.statusPriority.trim(), 10) : 0;
      const statusColor = row.statusColor?.trim() || null;
      const statusIsFinal = row.statusIsFinal === '1' || row.statusIsFinal?.toLowerCase() === 'true';
      const statusIsLost = row.statusIsLost === '1' || row.statusIsLost?.toLowerCase() === 'true';
      const statusIsActiveRaw = row.statusIsActive?.trim();
      const statusIsActive =
        statusIsActiveRaw === '' || statusIsActiveRaw === undefined
          ? true
          : statusIsActiveRaw !== '0' && statusIsActiveRaw.toLowerCase() !== 'false';
      const statusSortOrder = row.statusSortOrder ? parseInt(row.statusSortOrder.trim(), 10) : 0;

      parsedRows.push({
        lineNo,
        statusCode,
        statusLabel,
        statusPriority: isNaN(statusPriority) ? 0 : statusPriority,
        statusColor,
        statusIsFinal,
        statusIsLost,
        statusSortOrder: isNaN(statusSortOrder) ? 0 : statusSortOrder,
        statusIsActive,
      });
    }

    // statusIsFinal / statusIsLost は複数設定可能（制約なし）

    try {
      await prisma.$transaction(async (tx) => {
        for (const row of parsedRows) {
          try {
            const existing = await tx.businessStatusDefinition.findFirst({
              where: { businessId, statusCode: row.statusCode },
              select: { id: true },
            });

            if (existing) {
              if (mode === 'create_only') {
                results.skipped++;
                continue;
              }
              await tx.businessStatusDefinition.update({
                where: { id: existing.id },
                data: {
                  statusLabel: row.statusLabel,
                  statusPriority: row.statusPriority,
                  statusColor: row.statusColor,
                  statusIsFinal: row.statusIsFinal,
                  statusIsLost: row.statusIsLost,
                  statusSortOrder: row.statusSortOrder,
                  statusIsActive: row.statusIsActive,
                },
              });
              results.updated++;
            } else {
              await tx.businessStatusDefinition.create({
                data: {
                  businessId,
                  statusCode: row.statusCode,
                  statusLabel: row.statusLabel,
                  statusPriority: row.statusPriority,
                  statusColor: row.statusColor,
                  statusIsFinal: row.statusIsFinal,
                  statusIsLost: row.statusIsLost,
                  statusSortOrder: row.statusSortOrder,
                  statusIsActive: row.statusIsActive,
                },
              });
              results.created++;
            }
          } catch (err) {
            const detail = err instanceof Error ? err.message : '';
            results.errors.push(
              `行${row.lineNo}: 処理中にエラーが発生しました${detail ? `（${detail}）` : ''}`
            );
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
