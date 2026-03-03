import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { PROJECT_FIELD_TEMPLATE_COLUMNS, FIELD_TYPE_LABEL_MAP, parseCSVLine } from '@/lib/csv-helpers';

// ============================================
// 案件カスタムフィールド定義の型
// ============================================

interface ProjectFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'month' | 'select' | 'checkbox' | 'url';
  options?: string[];
  required?: boolean;
  description?: string;
  sortOrder: number;
  visibleToPartner?: boolean;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

// ============================================
// POST /api/v1/businesses/:id/project-fields/csv — インポート
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

    // 事業の存在確認 + 既存フィールド定義取得
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { businessConfig: true, version: true },
    });
    if (!business) throw ApiError.notFound('事業が見つかりません');

    const existingConfig = (business.businessConfig ?? {}) as Record<string, unknown>;
    const existingFields = (existingConfig.projectFields ?? []) as Array<Record<string, unknown>>;

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
      PROJECT_FIELD_TEMPLATE_COLUMNS.map((c) => [c.label, c.key])
    );

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      dryRun,
    };

    // 既存フィールドを key をもとに Map 化
    const existingMap = new Map<string, Record<string, unknown>>();
    for (const field of existingFields) {
      if (typeof field.key === 'string') {
        existingMap.set(field.key, field);
      }
    }

    // CSV 行ごとに処理
    const csvEntries: Array<{ key: string; entry: ProjectFieldDefinition; isUpdate: boolean }> = [];

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
        const fieldKey = row.key?.trim();
        if (!fieldKey) {
          results.errors.push(`行${lineNo}: フィールドキーが空です`);
          results.skipped++;
          continue;
        }
        if (!KEY_PATTERN.test(fieldKey)) {
          results.errors.push(`行${lineNo}: フィールドキー「${fieldKey}」は小文字英字で始まり、小文字英数字とアンダースコアのみ使用できます`);
          results.skipped++;
          continue;
        }

        // label バリデーション（必須）
        const label = row.label?.trim();
        if (!label) {
          results.errors.push(`行${lineNo}: 表示ラベルが空です`);
          results.skipped++;
          continue;
        }

        // type バリデーション（必須）— 日本語・英語両方受け付け
        const rawType = row.type?.trim();
        if (!rawType) {
          results.errors.push(`行${lineNo}: 型が空です`);
          results.skipped++;
          continue;
        }
        const mappedType = FIELD_TYPE_LABEL_MAP[rawType];
        if (!mappedType) {
          const validLabels = ['テキスト', 'テキストエリア', '数値', '日付', '年月', '選択', 'チェックボックス', 'URL'];
          results.errors.push(`行${lineNo}: 型「${rawType}」は無効です。有効な値: ${validLabels.join(', ')}`);
          results.skipped++;
          continue;
        }
        const typeValue = mappedType as ProjectFieldDefinition['type'];

        // options: select 型の場合、セル内カンマ区切りで分割
        let options: string[] | undefined;
        if (typeValue === 'select' && row.options?.trim()) {
          options = row.options
            .split(',')
            .map((o) => o.trim())
            .filter((o) => o !== '');
        }

        // required: '1' または 'true' で true
        const required = row.required?.trim() === '1' || row.required?.trim().toLowerCase() === 'true';

        // sortOrder: parseInt、デフォルトは行インデックス（i - 1）
        let sortOrder = i - 1;
        if (row.sortOrder?.trim()) {
          const parsed = parseInt(row.sortOrder.trim(), 10);
          if (!isNaN(parsed) && parsed >= 0) sortOrder = parsed;
        }

        // visibleToPartner: '1' または 'true' で true
        const visibleToPartner =
          row.visibleToPartner?.trim() === '1' ||
          row.visibleToPartner?.trim().toLowerCase() === 'true';

        const entry: ProjectFieldDefinition = {
          key: fieldKey,
          label,
          type: typeValue,
          ...(options !== undefined ? { options } : {}),
          required,
          ...(row.description?.trim() ? { description: row.description.trim() } : {}),
          sortOrder,
          visibleToPartner,
        };

        const isUpdate = existingMap.has(fieldKey);

        if (isUpdate && mode === 'create_only') {
          results.skipped++;
          continue;
        }

        csvEntries.push({ key: fieldKey, entry, isUpdate });
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

    // 最終配列: 既存順を維持しつつ新規追加分を末尾に
    const mergedFields = Array.from(existingMap.values());

    // ドライランでなければ DB 更新
    if (!dryRun) {
      await prisma.business.update({
        where: { id: businessId },
        data: {
          businessConfig: {
            ...existingConfig,
            projectFields: mergedFields,
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
