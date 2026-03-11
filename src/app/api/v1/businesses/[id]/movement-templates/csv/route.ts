import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { MOVEMENT_TEMPLATE_COLUMNS, parseCSVLine } from '@/lib/csv-helpers';
import { syncMovementsForTemplate, deleteMovementsForTemplate } from '@/lib/project-helpers';

// ============================================
// POST /api/v1/businesses/:id/movement-templates/csv
// ムーブメントテンプレート CSV インポート
// ============================================
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
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

    // Numbers 等がシート名を先頭行に挿入するケースに対応
    let headerLineIndex = 0;
    while (headerLineIndex < allLines.length && !allLines[headerLineIndex].includes(',')) {
      headerLineIndex++;
    }
    const lines = allLines.slice(headerLineIndex);

    if (lines.length < 2) {
      throw new ApiError('VALIDATION_ERROR', 'データ行が存在しません', 400);
    }

    // ヘッダー行をパースし、末尾の「 *」を除去してラベル→キーのマップを作成
    const rawHeaders = parseCSVLine(lines[0]);
    const headers = rawHeaders.map((h) => h.replace(/\s*\*\s*$/, '').trim());
    const labelToKey = Object.fromEntries(
      MOVEMENT_TEMPLATE_COLUMNS.map((c) => [c.label, c.key])
    );

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      dryRun,
    };

    // 新規登録時のステップ番号採番用カウンター（既存最大値 + 連番）
    const maxStepAgg = await prisma.movementTemplate.aggregate({
      where: { businessId },
      _max: { stepNumber: true },
    });
    let nextStepNumber = (maxStepAgg._max.stepNumber ?? 0) + 1;

    try {
      await prisma.$transaction(
        async (tx) => {
          for (let i = 1; i < lines.length; i++) {
            const lineNo = headerLineIndex + i + 1;
            try {
              const values = parseCSVLine(lines[i]);
              const row: Record<string, string> = {};
              headers.forEach((h, idx) => {
                const key = labelToKey[h];
                if (key) row[key] = values[idx] ?? '';
              });

              // --- stepCode バリデーション（必須 + 形式チェック） ---
              const stepCode = row.stepCode?.trim();
              if (!stepCode) {
                results.errors.push(`行${lineNo}: ステップコードが空です`);
                results.skipped++;
                continue;
              }
              if (!/^[a-zA-Z0-9_]+$/.test(stepCode)) {
                results.errors.push(
                  `行${lineNo}: ステップコード「${stepCode}」は英数字とアンダースコアのみ使用できます`
                );
                results.skipped++;
                continue;
              }

              // --- stepName バリデーション（必須） ---
              const stepName = row.stepName?.trim();
              if (!stepName) {
                results.errors.push(`行${lineNo}: ステップ名が空です`);
                results.skipped++;
                continue;
              }

              // --- 任意フィールドのパース ---
              const stepDescription = row.stepDescription?.trim() || null;

              const parseBool = (val: string | undefined, defaultVal: boolean): boolean => {
                if (val === undefined || val.trim() === '') return defaultVal;
                return val.trim() !== '0';
              };

              const stepIsSalesLinked = parseBool(row.stepIsSalesLinked, false);
              const stepIsActive = parseBool(row.stepIsActive, true);
              const visibleToPartner = parseBool(row.visibleToPartner, false);

              const stepLinkedStatusCode = row.stepLinkedStatusCode?.trim() || null;

              // --- stepIsSalesLinked=true 時の連動ステータスコード存在確認 ---
              if (stepIsSalesLinked && stepLinkedStatusCode) {
                const statusExists = await tx.businessStatusDefinition.findFirst({
                  where: { businessId, statusCode: stepLinkedStatusCode },
                  select: { id: true },
                });
                if (!statusExists) {
                  results.errors.push(
                    `行${lineNo}: 連動ステータスコード「${stepLinkedStatusCode}」が事業内に存在しません`
                  );
                  results.skipped++;
                  continue;
                }
              }

              // --- 既存レコードの確認（businessId + stepCode で一意） ---
              const existing = await tx.movementTemplate.findFirst({
                where: { businessId, stepCode },
                select: { id: true },
              });

              if (existing) {
                if (mode === 'create_only') {
                  results.skipped++;
                  continue;
                }

                // 更新前に現在の stepIsActive を取得して変更検知
                const currentTemplate = await tx.movementTemplate.findUnique({
                  where: { id: existing.id },
                  select: { stepIsActive: true },
                });

                await tx.movementTemplate.update({
                  where: { id: existing.id },
                  data: {
                    stepName,
                    stepDescription,
                    stepIsSalesLinked,
                    stepLinkedStatusCode: stepIsSalesLinked ? stepLinkedStatusCode : null,
                    stepIsActive,
                    visibleToPartner,
                  },
                });

                // stepIsActive 変更時に ProjectMovement を同期
                if (currentTemplate && currentTemplate.stepIsActive !== stepIsActive) {
                  if (stepIsActive) {
                    await syncMovementsForTemplate(tx, existing.id, businessId);
                  } else {
                    await deleteMovementsForTemplate(tx, existing.id);
                  }
                }

                results.updated++;
              } else {
                // 新規作成 — stepNumber を自動採番
                const created = await tx.movementTemplate.create({
                  data: {
                    businessId,
                    stepNumber: nextStepNumber++,
                    stepCode,
                    stepName,
                    stepDescription,
                    stepIsSalesLinked,
                    stepLinkedStatusCode: stepIsSalesLinked ? stepLinkedStatusCode : null,
                    stepIsActive,
                    visibleToPartner,
                  },
                });

                // 有効なテンプレートの場合、既存全案件に ProjectMovement を同期
                if (stepIsActive) {
                  await syncMovementsForTemplate(tx, created.id, businessId);
                }

                results.created++;
              }
            } catch (err) {
              const detail = err instanceof Error ? err.message : '';
              results.errors.push(
                `行${lineNo}: 処理中にエラーが発生しました${detail ? `（${detail}）` : ''}`
              );
              results.skipped++;
            }
          }

          // ドライランの場合はトランザクションをロールバック
          if (dryRun) {
            throw { __dryRunRollback: true };
          }
        },
        { timeout: 120000 }
      );
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
