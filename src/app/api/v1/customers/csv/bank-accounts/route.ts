import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { CUSTOMER_BANK_ACCOUNT_TEMPLATE_COLUMNS, parseCSVLine } from '@/lib/csv-helpers';

// ============================================
// POST /api/v1/customers/csv/bank-accounts — 顧客口座情報 CSV インポート
// customerCode で顧客を特定し、(customerId, businessId) ペアで upsert
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
      CUSTOMER_BANK_ACCOUNT_TEMPLATE_COLUMNS.map((c) => [c.label, c.key])
    );

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      dryRun,
    };

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

              // --- customerCode バリデーション（必須）---
              const customerCode = row.customerCode?.trim();
              if (!customerCode) {
                results.errors.push(`行${lineNo}: 顧客コードが空です`);
                results.skipped++;
                continue;
              }

              // --- customerCode → customerId 解決 ---
              const customer = await tx.customer.findUnique({
                where: { customerCode },
                select: { id: true },
              });
              if (!customer) {
                results.errors.push(`行${lineNo}: 顧客コード「${customerCode}」が存在しません`);
                results.skipped++;
                continue;
              }
              const customerId = customer.id;

              // --- businessCode → businessId 解決（任意）---
              let businessId: number | null = null;
              const businessCode = row.businessCode?.trim();
              if (businessCode) {
                const business = await tx.business.findUnique({
                  where: { businessCode },
                  select: { id: true },
                });
                if (!business) {
                  results.errors.push(
                    `行${lineNo}: 事業コード「${businessCode}」が存在しません`
                  );
                  results.skipped++;
                  continue;
                }
                businessId = business.id;
              }

              // --- 必須フィールドバリデーション ---
              const bankName = row.bankName?.trim();
              if (!bankName) {
                results.errors.push(`行${lineNo}: 金融機関名が空です`);
                results.skipped++;
                continue;
              }

              const branchName = row.branchName?.trim();
              if (!branchName) {
                results.errors.push(`行${lineNo}: 支店名が空です`);
                results.skipped++;
                continue;
              }

              const accountType = row.accountType?.trim();
              if (!accountType) {
                results.errors.push(`行${lineNo}: 口座種別が空です`);
                results.skipped++;
                continue;
              }
              if (accountType !== '普通' && accountType !== '当座') {
                results.errors.push(
                  `行${lineNo}: 口座種別「${accountType}」は無効です（「普通」または「当座」を指定してください）`
                );
                results.skipped++;
                continue;
              }

              const accountNumber = row.accountNumber?.trim();
              if (!accountNumber) {
                results.errors.push(`行${lineNo}: 口座番号が空です`);
                results.skipped++;
                continue;
              }

              const accountHolder = row.accountHolder?.trim();
              if (!accountHolder) {
                results.errors.push(`行${lineNo}: 名義人が空です`);
                results.skipped++;
                continue;
              }

              // --- (customerId, businessId) ペアで既存レコードを検索 ---
              const existing =
                businessId === null
                  ? await tx.customerBankAccount.findFirst({
                      where: { customerId, businessId: null },
                      select: { id: true },
                    })
                  : await tx.customerBankAccount.findFirst({
                      where: { customerId, businessId },
                      select: { id: true },
                    });

              const accountData = {
                bankName,
                branchName,
                accountType,
                accountNumber,
                accountHolder,
              };

              if (existing) {
                if (mode === 'create_only') {
                  results.skipped++;
                  continue;
                }
                // upsert: 更新
                await tx.customerBankAccount.update({
                  where: { id: existing.id },
                  data: accountData,
                });
                results.updated++;
              } else {
                // 新規作成
                await tx.customerBankAccount.create({
                  data: {
                    customerId,
                    businessId,
                    ...accountData,
                  },
                });
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
