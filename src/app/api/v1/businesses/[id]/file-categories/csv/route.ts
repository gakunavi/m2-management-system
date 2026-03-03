import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { FILE_CATEGORY_TEMPLATE_COLUMNS, parseCSVLine } from '@/lib/csv-helpers';

// ============================================
// ファイルカテゴリの型
// ============================================

interface FileCategory {
  key: string;
  label: string;
  sortOrder: number;
}

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

// ============================================
// POST /api/v1/businesses/:id/file-categories/csv — インポート
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

    // 事業の存在確認 + 既存カテゴリ取得
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { businessConfig: true, version: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const existingConfig = (business.businessConfig ?? {}) as Record<string, unknown>;
    const existingCategories = (existingConfig.fileCategories ?? []) as Array<Record<string, unknown>>;

    // CSV 解析
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

    // ラベル → キー マッピング
    const labelToKey = Object.fromEntries(
      FILE_CATEGORY_TEMPLATE_COLUMNS.map((c) => [c.label, c.key])
    );

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      dryRun,
    };

    // 既存カテゴリを key で Map 化
    const existingMap = new Map<string, Record<string, unknown>>();
    for (const cat of existingCategories) {
      if (typeof cat.key === 'string') {
        existingMap.set(cat.key, cat);
      }
    }

    // CSV 行ごとに処理
    const csvEntries: Array<{ key: string; entry: FileCategory; isUpdate: boolean }> = [];

    for (let i = 1; i < lines.length; i++) {
      const lineNo = headerLineIndex + i + 1;
      // ヒント行（# で始まる行）をスキップ
      if (lines[i].trimStart().startsWith('#')) {
        continue;
      }

      try {
        const values = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          const key = labelToKey[h];
          if (key) row[key] = values[idx] ?? '';
        });

        // key バリデーション（必須）
        const categoryKey = row.key?.trim();
        if (!categoryKey) {
          results.errors.push(`行${lineNo}: カテゴリキーが空です`);
          results.skipped++;
          continue;
        }
        if (!KEY_PATTERN.test(categoryKey)) {
          results.errors.push(`行${lineNo}: カテゴリキー「${categoryKey}」は英字で始まり、英数字とアンダースコアのみ使用できます`);
          results.skipped++;
          continue;
        }

        // label バリデーション（必須）
        const label = row.label?.trim();
        if (!label) {
          results.errors.push(`行${lineNo}: 表示名が空です`);
          results.skipped++;
          continue;
        }

        // sortOrder
        let sortOrder = i - 1;
        if (row.sortOrder?.trim()) {
          const parsed = parseInt(row.sortOrder.trim(), 10);
          if (!isNaN(parsed) && parsed >= 0) sortOrder = parsed;
        }

        const entry: FileCategory = { key: categoryKey, label, sortOrder };
        const isUpdate = existingMap.has(categoryKey);

        if (isUpdate && mode === 'create_only') {
          results.skipped++;
          continue;
        }

        // CSV内の重複キーチェック
        if (csvEntries.some((e) => e.key === categoryKey)) {
          results.errors.push(`行${lineNo}: カテゴリキー「${categoryKey}」がCSV内で重複しています`);
          results.skipped++;
          continue;
        }

        csvEntries.push({ key: categoryKey, entry, isUpdate });
      } catch (err) {
        const detail = err instanceof Error ? err.message : '';
        results.errors.push(`行${lineNo}: 処理中にエラーが発生しました${detail ? `（${detail}）` : ''}`);
        results.skipped++;
      }
    }

    // マージ: 既存 Map を CSV エントリで上書きまたは追加
    for (const { key, entry, isUpdate } of csvEntries) {
      existingMap.set(key, entry as unknown as Record<string, unknown>);
      if (isUpdate) {
        results.updated++;
      } else {
        results.created++;
      }
    }

    // 最終配列
    const mergedCategories = Array.from(existingMap.values());

    // ドライランでなければ DB 更新
    if (!dryRun) {
      await prisma.business.update({
        where: { id: businessId },
        data: {
          businessConfig: {
            ...existingConfig,
            fileCategories: mergedCategories,
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
