import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { authorizeIntegrationRequest } from '@/lib/integration-auth';
import {
  customerImportSchema,
  toValidationErrors,
  importCustomer,
  resolveImportBusiness,
  CustomerNotFoundError,
  CustomerImportConflictError,
} from '@/lib/customer-import';
import {
  hashRequestBody,
  findIdempotentResponse,
  saveIdempotentResponse,
  IDEMPOTENCY_SCOPE_CUSTOMER_IMPORT,
} from '@/lib/integration-idempotency';
import { customerAdminUrl } from '@/lib/integration-url';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/integrations/customers/import
//
// 購入申込フォームの顧客情報を m2 に反映する。
// - 認証: Authorization: Bearer <INTEGRATION_API_TOKEN>（未設定なら 404 / 不一致は 401）
// - 特定キー: mo_no（事業別カスタムフィールド MO番号）
// - 既定は更新のみ。mo_no 未ヒットは 404。allow_create=true のときだけ新規作成（201）
// - 空欄は自動で埋め、食い違いは conflicts で返す。上書きは overwrite_fields 指定のみ
// - dry_run=true は DB を一切変更せず、冪等キーも消費しない
//
// ⚠️ リクエストボディは絶対にログへ出さない（口座番号・口座名義・法人番号を含むため）。
// ============================================================================

export async function POST(request: NextRequest) {
  const auth = authorizeIntegrationRequest(request);
  if (!auth.ok) return auth.response;

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = customerImportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', errors: toValidationErrors(parsed.error as ZodError) },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // dry_run は冪等キーを消費しない（検証を何度でも繰り返せるようにする）
  const useIdempotency = idempotencyKey !== null && !input.dry_run;
  const requestHash = hashRequestBody(input);

  try {
    if (useIdempotency) {
      const previous = await findIdempotentResponse(
        IDEMPOTENCY_SCOPE_CUSTOMER_IMPORT,
        idempotencyKey as string,
      );
      if (previous) {
        if (previous.requestHash !== requestHash) {
          return NextResponse.json(
            {
              error:
                'Idempotency-Key conflict: このキーは異なる内容のリクエストで既に使用されています',
            },
            { status: 409 },
          );
        }
        return NextResponse.json(previous.responseBody, {
          status: previous.statusCode,
          headers: { 'Idempotent-Replay': 'true' },
        });
      }
    }

    const business = await resolveImportBusiness();
    if (!business) {
      logger.error(
        '連携API: 取り込み対象事業を解決できません（INTEGRATION_BUSINESS_CODE を確認してください）',
        undefined,
        'customer-import',
      );
      return NextResponse.json({ error: 'Import target business is not configured' }, { status: 500 });
    }

    const result = await importCustomer(input, business);

    const status = result.created && !result.dryRun ? 201 : 200;
    const body = {
      mo_no: input.mo_no,
      id: result.id,
      url: result.id !== null ? customerAdminUrl(result.id) : null,
      created: result.created,
      dry_run: result.dryRun,
      filled_fields: result.filledFields,
      updated_fields: result.updatedFields,
      conflicts: result.conflicts,
      warnings: result.warnings,
    };

    if (useIdempotency) {
      await saveIdempotentResponse(
        IDEMPOTENCY_SCOPE_CUSTOMER_IMPORT,
        idempotencyKey as string,
        requestHash,
        status,
        body,
      );
    }

    logger.info(
      '連携API: 顧客を取り込みました',
      {
        moNo: input.mo_no,
        customerId: result.id,
        created: result.created,
        dryRun: result.dryRun,
        filledCount: result.filledFields.length,
        updatedCount: result.updatedFields.length,
        conflictCount: result.conflicts.length,
      },
      'customer-import',
    );

    return NextResponse.json(body, { status });
  } catch (error) {
    // mo_no 未ヒット（更新のみモード）→ 404
    if (error instanceof CustomerNotFoundError) {
      return NextResponse.json(
        {
          error: `mo_no=${error.moNo} の顧客が m2 に見つかりません。新規作成する場合は allow_create: true を指定してください。`,
          mo_no: error.moNo,
        },
        { status: 404 },
      );
    }
    // 既存データの整合性を壊す取り込み → 409
    if (error instanceof CustomerImportConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Conflict: 一意制約に違反しました（法人番号の重複の可能性があります）' },
        { status: 409 },
      );
    }
    // ボディは出さない（口座番号・法人番号を含むため）
    logger.error('連携API: 顧客取り込みに失敗しました', error, 'customer-import');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
