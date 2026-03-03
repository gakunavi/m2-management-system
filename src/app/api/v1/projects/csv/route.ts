import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams, buildOrderBy } from '@/lib/sort-helper';
import { escapeCSV, parseCSVLine } from '@/lib/csv-helpers';
import { generateProjectNo, createInitialMovements } from '@/lib/project-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

const PROJECT_SORT_FIELDS = [
  'projectNo',
  'projectSalesStatus',
  'projectExpectedCloseMonth',
  'projectAssignedUserName',
  'updatedAt',
  'createdAt',
] as const;

// 固定ヘッダー定義
const FIXED_HEADERS = [
  { key: 'projectNo', label: '案件番号' },
  { key: 'customerCode', label: '顧客コード' },
  { key: 'customerName', label: '顧客名' },
  { key: 'partnerCode', label: '代理店コード' },
  { key: 'partnerName', label: '代理店名' },
  { key: 'businessName', label: '事業名' },
  { key: 'projectSalesStatus', label: '営業ステータスコード' },
  { key: 'projectSalesStatusLabel', label: '営業ステータス' },
  { key: 'projectExpectedCloseMonth', label: '受注予定月' },
  { key: 'projectAssignedUserName', label: '担当者名' },
  { key: 'projectNotes', label: '備考' },
  { key: 'projectIsActive', label: '有効フラグ' },
  { key: 'createdAt', label: '作成日時' },
  { key: 'updatedAt', label: '更新日時' },
] as const;

// ============================================
// GET /api/v1/projects/csv — エクスポート
// ============================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw ApiError.unauthorized();

    const user = session.user as { id: number; role: string; partnerId?: number };
    const { searchParams } = request.nextUrl;

    const search = searchParams.get('search') ?? '';
    const businessIdParam = searchParams.get('businessId');
    const isActiveParam = searchParams.get('filter[isActive]') || searchParams.get('isActive') || '';
    const statusFilter = searchParams.get('filter[projectSalesStatus]');
    const sortItems = parseSortParams(searchParams, 'updatedAt', 'desc');
    const columnsParam = searchParams.get('columns');

    const where: Record<string, unknown> = {
      projectIsActive: isActiveParam === 'false' ? false : true,
    };

    if (businessIdParam) {
      where.businessId = parseInt(businessIdParam, 10);
    } else if (user.role === 'staff') {
      const assignments = await prisma.userBusinessAssignment.findMany({
        where: { userId: user.id },
        select: { businessId: true },
      });
      where.businessId = { in: assignments.map((a) => a.businessId) };
    } else if (user.role === 'partner_admin' || user.role === 'partner_staff') {
      if (user.partnerId) {
        where.partnerId = user.partnerId;
      }
    }

    if (search) {
      where.OR = [
        { projectNo: { contains: search, mode: 'insensitive' } },
        { customer: { customerName: { contains: search, mode: 'insensitive' } } },
        { partner: { partnerName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (statusFilter) {
      const statuses = statusFilter.split(',').filter(Boolean);
      if (statuses.length > 0) {
        where.projectSalesStatus = { in: statuses };
      }
    }

    const orderBy = buildOrderBy(sortItems, PROJECT_SORT_FIELDS, [{ field: 'updatedAt', direction: 'desc' }]);

    // businessId が確定している場合のみ動的フィールドを取得
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;
    let projectFields: ProjectFieldDefinition[] = [];
    if (businessId) {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { businessConfig: true },
      });
      const config = business?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
      projectFields = (config?.projectFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // 動的ヘッダーを結合
    const dynamicHeaders = projectFields.map((f) => ({ key: f.key, label: f.label, isDynamic: true }));
    const allHeaders = [...FIXED_HEADERS.map((h) => ({ ...h, isDynamic: false })), ...dynamicHeaders];

    // 列フィルタリング
    const exportHeaders = columnsParam
      ? (() => {
          const keys = columnsParam.split(',').filter((k) => k.trim() !== '');
          const matched = keys
            .map((k) => allHeaders.find((h) => h.key === k))
            .filter((h): h is (typeof allHeaders)[number] => h !== undefined);
          return matched.length > 0 ? matched : allHeaders;
        })()
      : allHeaders;

    const projects = await prisma.project.findMany({
      where,
      orderBy,
      include: {
        customer: { select: { id: true, customerCode: true, customerName: true } },
        partner: { select: { id: true, partnerCode: true, partnerName: true } },
        business: { select: { id: true, businessName: true } },
      },
    });

    // ステータスラベルを一括取得
    const allStatuses = await prisma.businessStatusDefinition.findMany({
      where: {
        businessId: businessId ? businessId : undefined,
        statusIsActive: true,
      },
      select: { businessId: true, statusCode: true, statusLabel: true },
    });
    const statusLabelMap: Record<string, string> = {};
    for (const s of allStatuses) {
      statusLabelMap[`${s.businessId}:${s.statusCode}`] = s.statusLabel;
    }

    const headerRow = exportHeaders.map((h) => escapeCSV(h.label)).join(',');
    const rows = projects.map((p) => {
      const customData = p.projectCustomData as Record<string, unknown> | null;
      const statusLabel = statusLabelMap[`${p.businessId}:${p.projectSalesStatus}`] ?? p.projectSalesStatus;

      const rowData: Record<string, unknown> = {
        projectNo: p.projectNo,
        customerCode: p.customer?.customerCode ?? '',
        customerName: p.customer?.customerName ?? '',
        partnerCode: p.partner?.partnerCode ?? '',
        partnerName: p.partner?.partnerName ?? '',
        businessName: p.business?.businessName ?? '',
        projectSalesStatus: p.projectSalesStatus,
        projectSalesStatusLabel: statusLabel,
        projectExpectedCloseMonth: p.projectExpectedCloseMonth ?? '',
        projectAssignedUserName: p.projectAssignedUserName ?? '',
        projectNotes: p.projectNotes ?? '',
        projectIsActive: p.projectIsActive ? '1' : '0',
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };

      // 動的フィールドを追加
      for (const field of projectFields) {
        rowData[field.key] = customData?.[field.key] ?? '';
      }

      return exportHeaders.map((h) => escapeCSV(rowData[h.key])).join(',');
    });

    const csv = [headerRow, ...rows].join('\r\n');
    const bom = '\uFEFF';
    const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `projects_${now}.csv`;

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
// POST /api/v1/projects/csv — インポート
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
    const businessIdParam =
      (formData.get('businessId') as string | null) ||
      request.nextUrl.searchParams.get('businessId');

    if (!file) {
      throw new ApiError('VALIDATION_ERROR', 'ファイルが指定されていません', 400);
    }
    if (!file.name.endsWith('.csv')) {
      throw new ApiError('VALIDATION_ERROR', 'CSVファイルのみインポートできます', 400);
    }
    if (!businessIdParam) {
      throw new ApiError('VALIDATION_ERROR', '事業IDが指定されていません', 400);
    }

    const businessId = parseInt(businessIdParam, 10);
    if (isNaN(businessId)) {
      throw new ApiError('VALIDATION_ERROR', '事業IDが不正です', 400);
    }

    // 事業の存在確認 + フィールド定義取得
    const business = await prisma.business.findFirst({
      where: { id: businessId, businessIsActive: true },
      select: { id: true, businessConfig: true },
    });
    if (!business) throw ApiError.badRequest('指定された事業が見つかりません');

    const config = business.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projectFields: ProjectFieldDefinition[] = (config?.projectFields ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder
    );

    // 営業ステータスを取得（コード・ラベル両方で引けるマップ）
    const statusDefs = await prisma.businessStatusDefinition.findMany({
      where: { businessId, statusIsActive: true },
      select: { statusCode: true, statusLabel: true },
    });
    const statusCodeSet = new Set(statusDefs.map((s) => s.statusCode));
    const statusLabelToCode: Record<string, string> = {};
    for (const s of statusDefs) {
      statusLabelToCode[s.statusLabel] = s.statusCode;
    }

    const text = await file.text();
    const content = text.startsWith('\uFEFF') ? text.slice(1) : text;
    const allLines = content.split(/\r?\n/).filter((l) => l.trim() !== '');

    // ヘッダー行検索
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

    // 固定列のラベル → キーマッピング
    const labelToKey: Record<string, string> = {
      '案件番号': 'projectNo',
      '顧客コード': 'customerCode',
      '顧客名': 'customerName',
      '代理店コード': 'partnerCode',
      '代理店名': 'partnerName',
      '営業ステータス': 'projectSalesStatus',
      '営業ステータスコード': 'projectSalesStatus',
      '受注予定月': 'projectExpectedCloseMonth',
      '担当者名': 'projectAssignedUserName',
      '備考': 'projectNotes',
      '有効フラグ': 'projectIsActive',
    };
    // 動的フィールドのラベル → キーマッピングを追加
    for (const field of projectFields) {
      labelToKey[field.label] = `custom_${field.key}`;
    }

    // isActive列がCSVに含まれるか判定（列がない場合、更新時に既存値を保持する）
    const hasIsActiveColumn = headers.some((h) => labelToKey[h] === 'projectIsActive');
    // projectNo列の有無（エクスポート→再インポート時のマッチングに利用）
    const hasProjectNoColumn = headers.some((h) => labelToKey[h] === 'projectNo');

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

          // 顧客の特定：コード優先、なければ名前で検索
          const customerCode = row.customerCode?.trim();
          const customerName = row.customerName?.trim();
          if (!customerCode && !customerName) {
            results.errors.push(`行${lineNo}: 顧客コードまたは顧客名が必要です`);
            results.skipped++;
            continue;
          }
          const customer = await tx.customer.findFirst({
            where: {
              ...(customerCode
                ? { customerCode }
                : { customerName: { equals: customerName, mode: 'insensitive' as const } }),
              customerIsActive: true,
            },
            select: { id: true },
          });
          if (!customer) {
            const identifier = customerCode || customerName;
            results.errors.push(`行${lineNo}: 顧客「${identifier}」が見つかりません`);
            results.skipped++;
            continue;
          }

          // 営業ステータスは必須（ラベルでもコードでも受付可）
          const salesStatusInput = row.projectSalesStatus?.trim();
          if (!salesStatusInput) {
            results.errors.push(`行${lineNo}: 営業ステータスが空です`);
            results.skipped++;
            continue;
          }
          let salesStatus: string;
          if (statusCodeSet.has(salesStatusInput)) {
            salesStatus = salesStatusInput;
          } else if (statusLabelToCode[salesStatusInput]) {
            salesStatus = statusLabelToCode[salesStatusInput];
          } else {
            results.errors.push(`行${lineNo}: 営業ステータス「${salesStatusInput}」が存在しません`);
            results.skipped++;
            continue;
          }

          // 代理店の特定（任意）：コード優先、なければ名前で検索
          let partnerId: number | null = null;
          const partnerCode = row.partnerCode?.trim();
          const partnerName = row.partnerName?.trim();
          if (partnerCode || partnerName) {
            const partner = await tx.partner.findFirst({
              where: {
                ...(partnerCode
                  ? { partnerCode }
                  : { partnerName: { equals: partnerName, mode: 'insensitive' as const } }),
                partnerIsActive: true,
              },
              select: { id: true },
            });
            if (!partner) {
              const identifier = partnerCode || partnerName;
              results.errors.push(`行${lineNo}: 代理店「${identifier}」が見つかりません`);
              results.skipped++;
              continue;
            }
            partnerId = partner.id;
          }

          // 担当者名（自由記入テキスト）
          const assignedUserName = row.projectAssignedUserName?.trim() || null;

          // 受注予定月のバリデーション
          const expectedCloseMonth = row.projectExpectedCloseMonth?.trim() || null;
          if (expectedCloseMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(expectedCloseMonth)) {
            results.errors.push(`行${lineNo}: 受注予定月「${expectedCloseMonth}」はYYYY-MM形式で入力してください`);
            results.skipped++;
            continue;
          }

          // 動的フィールドデータの構築
          const customData: Record<string, unknown> = {};
          for (const field of projectFields) {
            const val = row[`custom_${field.key}`];
            if (val !== undefined && val !== '') {
              if (field.type === 'number') {
                const num = parseFloat(val);
                customData[field.key] = isNaN(num) ? null : num;
              } else if (field.type === 'checkbox') {
                customData[field.key] = val === '1' || val.toLowerCase() === 'true';
              } else {
                customData[field.key] = val;
              }
            }
          }

          const baseData = {
            projectSalesStatus: salesStatus,
            partnerId,
            projectExpectedCloseMonth: expectedCloseMonth,
            projectAssignedUserName: assignedUserName,
            projectNotes: row.projectNotes?.trim() || null,
            updatedBy: user.id,
          };

          if (mode === 'create_only') {
            const projectNo = await generateProjectNo(tx, businessId);
            const created = await tx.project.create({
              data: {
                businessId,
                customerId: customer.id,
                projectNo,
                projectStatusChangedAt: new Date(),
                ...baseData,
                projectCustomData: customData as Prisma.InputJsonValue,
                projectIsActive: row.projectIsActive !== '0',
                createdBy: user.id,
              },
            });
            await createInitialMovements(tx, created.id, businessId);
            results.created++;
          } else {
            // upsert モード: projectNo優先 → businessId+customerId フォールバック
            const projectNoInput = hasProjectNoColumn ? row.projectNo?.trim() : '';
            let existingProject: {
              id: number;
              projectSalesStatus: string;
              version: number;
              projectCustomData: unknown;
            } | null = null;

            if (projectNoInput) {
              existingProject = await tx.project.findFirst({
                where: {
                  businessId,
                  projectNo: projectNoInput,
                  projectIsActive: true,
                },
                select: { id: true, projectSalesStatus: true, version: true, projectCustomData: true },
              });
            }

            if (!existingProject) {
              existingProject = await tx.project.findFirst({
                where: {
                  businessId,
                  customerId: customer.id,
                  projectIsActive: true,
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true, projectSalesStatus: true, version: true, projectCustomData: true },
              });
            }

            if (existingProject) {
              // 既存のcustomDataとマージ（CSVにないフィールドは既存値を保持）
              const existingCustomData = (existingProject.projectCustomData as Record<string, unknown>) ?? {};
              const mergedCustomData = { ...existingCustomData, ...customData };

              const statusChanged = existingProject.projectSalesStatus !== salesStatus;
              await tx.project.update({
                where: { id: existingProject.id },
                data: {
                  ...baseData,
                  projectCustomData: mergedCustomData as Prisma.InputJsonValue,
                  ...(hasIsActiveColumn ? { projectIsActive: row.projectIsActive !== '0' } : {}),
                  ...(statusChanged ? { projectStatusChangedAt: new Date() } : {}),
                  version: { increment: 1 },
                },
              });
              results.updated++;
            } else {
              const projectNo = await generateProjectNo(tx, businessId);
              const created = await tx.project.create({
                data: {
                  businessId,
                  customerId: customer.id,
                  projectNo,
                  projectStatusChangedAt: new Date(),
                  ...baseData,
                  projectCustomData: customData as Prisma.InputJsonValue,
                  projectIsActive: row.projectIsActive !== '0',
                  createdBy: user.id,
                },
              });
              await createInitialMovements(tx, created.id, businessId);
              results.created++;
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
