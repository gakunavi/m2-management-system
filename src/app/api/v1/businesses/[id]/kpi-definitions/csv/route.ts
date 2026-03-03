import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { KPI_DEFINITION_TEMPLATE_COLUMNS, AGGREGATION_LABEL_MAP, parseCSVLine } from '@/lib/csv-helpers';

// ============================================
// KPI定義の型
// ============================================

interface KpiDefinition {
  key: string;
  label: string;
  unit?: string;
  aggregation: 'sum' | 'count';
  sourceField?: string;
  statusFilter?: string;
  dateField?: string;
  isPrimary: boolean;
  sortOrder: number;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

// ============================================
// POST /api/v1/businesses/:id/kpi-definitions/csv — インポート
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string };
    if (!['admin', 'staff'].includes(user.role)) throw ApiError.forbidden();

    const { id } = await params;
    const businessId = parseInt(id, 10);
    if (isNaN(businessId)) throw ApiError.notFound('事業が見つかりません');

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

    // 事業の存在確認 + 既存KPI定義取得
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { businessConfig: true, version: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const existingConfig = (business.businessConfig ?? {}) as Record<string, unknown>;
    const existingDefinitions = (existingConfig.kpiDefinitions ?? []) as Array<Record<string, unknown>>;

    // CSV 解析
    const text = await file.text();
    const content = text.startsWith('\uFEFF') ? text.slice(1) : text;
    const allLines = content.split(/\r?\n/).filter((l) => l.trim() !== '');

    // Numbers 等がシート名を先頭行に挿入するケースに対応
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

    // テンプレート列定義からラベル → キーのマッピングを構築
    const labelToKey = Object.fromEntries(
      KPI_DEFINITION_TEMPLATE_COLUMNS.map((c) => [c.label, c.key])
    );

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      dryRun,
    };

    // 既存定義を key をもとに Map 化
    const existingMap = new Map<string, Record<string, unknown>>();
    for (const def of existingDefinitions) {
      if (typeof def.key === 'string') {
        existingMap.set(def.key, def);
      }
    }

    // 既存の isPrimary 状態を確認（マージ後に最大1件の制約を検証するため）
    const existingPrimaryKey = existingDefinitions.find(
      (d) => d.isPrimary === true
    )?.key as string | undefined;

    // CSV 行ごとに処理
    const csvEntries: Array<{ key: string; entry: KpiDefinition; isUpdate: boolean }> = [];
    // CSV 内で isPrimary=true を設定した最初の key を追跡（重複検出用）
    let csvPrimaryKey: string | null = null;

    for (let i = 1; i < lines.length; i++) {
      const lineNo = headerLineIndex + i + 1;
      try {
        const values = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          const key = labelToKey[h];
          if (key) row[key] = values[idx] ?? '';
        });

        // key バリデーション（必須）
        const kpiKey = row.key?.trim();
        if (!kpiKey) {
          results.errors.push(`行${lineNo}: KPIキーが空です`);
          results.skipped++;
          continue;
        }
        if (!KEY_PATTERN.test(kpiKey)) {
          results.errors.push(`行${lineNo}: KPIキー「${kpiKey}」は小文字英字で始まり、小文字英数字とアンダースコアのみ使用できます`);
          results.skipped++;
          continue;
        }

        // label バリデーション（必須）
        const label = row.label?.trim();
        if (!label) {
          results.errors.push(`行${lineNo}: ラベルが空です`);
          results.skipped++;
          continue;
        }

        // aggregation バリデーション — 日本語・英語両方受け付け
        const rawAggregation = row.aggregation?.trim();
        let aggregation: KpiDefinition['aggregation'] = 'sum';
        if (rawAggregation) {
          const mapped = AGGREGATION_LABEL_MAP[rawAggregation];
          if (!mapped) {
            results.errors.push(`行${lineNo}: 集計方法「${rawAggregation}」は無効です。有効な値: 合計, カウント`);
            results.skipped++;
            continue;
          }
          aggregation = mapped as KpiDefinition['aggregation'];
        }

        // isPrimary バリデーション（CSV 内での重複チェック）
        const isPrimary =
          row.isPrimary?.trim() === '1' ||
          row.isPrimary?.trim().toLowerCase() === 'true';

        if (isPrimary) {
          if (csvPrimaryKey !== null && csvPrimaryKey !== kpiKey) {
            // 既に別のキーが isPrimary=true を宣言済み → エラー
            results.errors.push(`行${lineNo}: isPrimary=true は1件のみ設定できます（「${csvPrimaryKey}」が既に設定されています）`);
            results.skipped++;
            continue;
          }
          csvPrimaryKey = kpiKey;
        }

        // sortOrder: parseInt、デフォルトは行インデックス（i - 1）
        let sortOrder = i - 1;
        if (row.sortOrder?.trim()) {
          const parsed = parseInt(row.sortOrder.trim(), 10);
          if (!isNaN(parsed) && parsed >= 0) sortOrder = parsed;
        }

        const entry: KpiDefinition = {
          key: kpiKey,
          label,
          ...(row.unit?.trim() ? { unit: row.unit.trim() } : {}),
          aggregation,
          ...(row.sourceField?.trim() ? { sourceField: row.sourceField.trim() } : {}),
          ...(row.statusFilter?.trim() ? { statusFilter: row.statusFilter.trim() } : {}),
          ...(row.dateField?.trim() ? { dateField: row.dateField.trim() } : {}),
          isPrimary,
          sortOrder,
        };

        const isUpdate = existingMap.has(kpiKey);

        if (isUpdate && mode === 'create_only') {
          results.skipped++;
          continue;
        }

        csvEntries.push({ key: kpiKey, entry, isUpdate });
      } catch (err) {
        const detail = err instanceof Error ? err.message : '';
        results.errors.push(`行${lineNo}: 処理中にエラーが発生しました${detail ? `（${detail}）` : ''}`);
        results.skipped++;
      }
    }

    // マージ後の isPrimary 整合性チェック
    // CSV で isPrimary=true を宣言したキーが存在し、かつ既存に別の isPrimary=true がある場合は
    // 既存の isPrimary を false に降格させる（最大1件制約の維持）
    const csvPrimarySet = new Set(csvEntries.filter((e) => e.entry.isPrimary).map((e) => e.key));

    // マージ: 既存 Map を CSV エントリで上書きまたは追加
    for (const { key, entry, isUpdate } of csvEntries) {
      // CSV が isPrimary=true を持つキー以外の既存エントリの isPrimary を false に降格
      if (csvPrimarySet.size > 0 && !csvPrimarySet.has(key)) {
        const existing = existingMap.get(key);
        if (existing && existing.isPrimary === true) {
          existingMap.set(key, { ...existing, isPrimary: false });
        }
      }
      existingMap.set(key, entry as unknown as Record<string, unknown>);
      if (isUpdate) {
        results.updated++;
      } else {
        results.created++;
      }
    }

    // CSV で isPrimary を変更していない場合も、既存エントリの isPrimary は保持
    // ただし CSV で isPrimary=true のキーが指定された場合、既存の別キーの isPrimary を false にする
    if (csvPrimarySet.size > 0 && existingPrimaryKey && !csvPrimarySet.has(existingPrimaryKey)) {
      const existing = existingMap.get(existingPrimaryKey);
      if (existing) {
        existingMap.set(existingPrimaryKey, { ...existing, isPrimary: false });
      }
    }

    // 最終配列: 既存順を維持しつつ新規追加分を末尾に
    const mergedDefinitions = Array.from(existingMap.values());

    // ドライランでなければ DB 更新
    if (!dryRun) {
      await prisma.business.update({
        where: { id: businessId },
        data: {
          businessConfig: {
            ...existingConfig,
            kpiDefinitions: mergedDefinitions,
          } as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedBy: user.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
