import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, ApiError } from '@/lib/error-handler';
import { parseSortParams } from '@/lib/sort-helper';
import { resolveSort, applyAppSort } from '@/lib/sort/engine';
import { PROJECT_CSV_SORT_SPEC } from '@/lib/sort/specs';
import { escapeCSV, parseCSVLine } from '@/lib/csv-helpers';
import { generateProjectNo, createInitialMovements } from '@/lib/project-helpers';
import { computeAllFormulas } from '@/lib/formula-evaluator';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// 固定ヘッダー定義
const FIXED_HEADERS = [
  { key: 'projectNo', label: '案件番号' },
  { key: 'customerCode', label: '顧客コード' },
  { key: 'customerName', label: '顧客名' },
  { key: 'customerSalutation', label: '顧客呼称' },
  { key: 'customerType', label: '顧客種別' },
  { key: 'customerRepresentativeName', label: '顧客代表者' },
  { key: 'customerWebsite', label: '顧客WEBサイト' },
  { key: 'customerFiscalMonth', label: '顧客決算月' },
  { key: 'customerFolderUrl', label: '顧客フォルダURL' },
  { key: 'partnerCode', label: '代理店コード' },
  { key: 'partnerName', label: '代理店名' },
  { key: 'partnerSalutation', label: '代理店呼称' },
  { key: 'partnerFolderUrl', label: '代理店フォルダURL' },
  { key: 'businessName', label: '事業名' },
  { key: 'projectSalesStatus', label: '営業ステータスコード' },
  { key: 'projectSalesStatusLabel', label: '営業ステータス' },
  { key: 'projectExpectedCloseMonth', label: '受注予定月' },
  { key: 'projectAssignedUserName', label: '担当者名' },
  { key: 'projectNotes', label: '備考' },
  { key: 'portalVisible', label: 'ポータル表示' },
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

    // CSV エクスポートは社内ユーザー専用（代理店は middleware でも遮断される）
    if (!['admin', 'staff'].includes(user.role)) {
      throw ApiError.forbidden();
    }

    const { searchParams } = request.nextUrl;

    const search = searchParams.get('search') ?? '';
    const businessIdParam = searchParams.get('businessId');
    const isActiveParam = searchParams.get('filter[isActive]') || searchParams.get('isActive') || '';
    const statusFilter = searchParams.get('filter[projectSalesStatus]');
    const sortItems = parseSortParams(searchParams, 'updatedAt', 'desc');
    const columnsParam = searchParams.get('columns');

    const where: Record<string, unknown> = {
      ...(isActiveParam === 'true' ? { projectIsActive: true }
        : isActiveParam === 'false' ? { projectIsActive: false }
        : {}),
    };

    const requestedBusinessId = businessIdParam ? parseInt(businessIdParam, 10) : undefined;

    if (requestedBusinessId !== undefined) {
      where.businessId = requestedBusinessId;
    }

    // staff は自分がアサインされた事業のみ。
    // businessId 指定の有無に関わらず適用する（指定でスコープが外れないように）。
    if (user.role === 'staff') {
      const assignments = await prisma.userBusinessAssignment.findMany({
        where: { userId: user.id },
        select: { businessId: true },
      });
      const assignedBusinessIds = assignments.map((a) => a.businessId);

      if (requestedBusinessId !== undefined) {
        if (!assignedBusinessIds.includes(requestedBusinessId)) {
          throw ApiError.forbidden('この事業の案件をエクスポートする権限がありません');
        }
      } else {
        where.businessId = { in: assignedBusinessIds };
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

    const { prismaOrderBy, appSortItems, needsAppSort } = resolveSort(sortItems, PROJECT_CSV_SORT_SPEC);
    const orderBy = (
      prismaOrderBy.length > 0 ? prismaOrderBy : [{ updatedAt: 'desc' }]
    ) as Prisma.ProjectOrderByWithRelationInput[];

    // businessId が確定している場合のみ動的フィールドを取得
    const businessId = businessIdParam ? parseInt(businessIdParam, 10) : null;
    let projectFields: ProjectFieldDefinition[] = [];
    let customerShowFields: ProjectFieldDefinition[] = [];
    let partnerShowFields: ProjectFieldDefinition[] = [];
    if (businessId) {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { businessConfig: true },
      });
      const config = business?.businessConfig as {
        projectFields?: ProjectFieldDefinition[];
        customerFields?: ProjectFieldDefinition[];
        partnerFields?: ProjectFieldDefinition[];
      } | null;
      projectFields = (config?.projectFields ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
      customerShowFields = (config?.customerFields ?? []).filter((f) => f.showOnProject).sort((a, b) => a.sortOrder - b.sortOrder);
      partnerShowFields = (config?.partnerFields ?? []).filter((f) => f.showOnProject).sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // 動的ヘッダーを結合（案件カスタム → 顧客showOnProject → 代理店showOnProject）
    const dynamicHeaders = projectFields.map((f) => ({ key: f.key, label: f.label, isDynamic: true }));
    const customerLinkHeaders = customerShowFields.map((f) => ({ key: `customerLink_${f.key}`, label: `顧客_${f.label}`, isDynamic: true }));
    const partnerLinkHeaders = partnerShowFields.map((f) => ({ key: `partnerLink_${f.key}`, label: `代理店_${f.label}`, isDynamic: true }));
    const allHeaders = [...FIXED_HEADERS.map((h) => ({ ...h, isDynamic: false })), ...dynamicHeaders, ...customerLinkHeaders, ...partnerLinkHeaders];

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
        customer: {
          select: {
            id: true,
            customerCode: true,
            customerName: true,
            customerSalutation: true,
            customerType: true,
            customerWebsite: true,
            customerFiscalMonth: true,
            customerFolderUrl: true,
            contacts: {
              where: { contactIsRepresentative: true },
              select: { contactName: true },
              take: 1,
            },
            businessLinks: {
              select: { businessId: true, linkCustomData: true },
            },
          },
        },
        partner: {
          select: {
            id: true,
            partnerCode: true,
            partnerName: true,
            partnerSalutation: true,
            partnerFolderUrl: true,
            businessLinks: {
              select: { businessId: true, linkCustomData: true },
            },
          },
        },
        business: { select: { id: true, businessName: true } },
      },
    });

    // 営業ステータス=定義順(statusSortOrder)はアプリ側で整列（CSVは全件出力）
    let sortedProjects = projects;
    if (needsAppSort) {
      const bizIds = Array.from(new Set(projects.map((p) => p.businessId)));
      const defs = bizIds.length > 0
        ? await prisma.businessStatusDefinition.findMany({
            where: { businessId: { in: bizIds } },
            select: { businessId: true, statusCode: true, statusSortOrder: true },
          })
        : [];
      const statusOrder = new Map(defs.map((d) => [`${d.businessId}:${d.statusCode}`, d.statusSortOrder]));
      sortedProjects = applyAppSort(projects, appSortItems, PROJECT_CSV_SORT_SPEC, { statusOrder });
    }

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
    const rows = sortedProjects.map((p) => {
      const customData = p.projectCustomData as Record<string, unknown> | null;
      const statusLabel = statusLabelMap[`${p.businessId}:${p.projectSalesStatus}`] ?? p.projectSalesStatus;

      const rowData: Record<string, unknown> = {
        projectNo: p.projectNo,
        customerCode: p.customer?.customerCode ?? '',
        customerName: p.customer?.customerName ?? '',
        customerSalutation: p.customer?.customerSalutation ?? '',
        customerType: p.customer?.customerType ?? '',
        customerRepresentativeName: p.customer?.contacts?.[0]?.contactName ?? '',
        customerWebsite: p.customer?.customerWebsite ?? '',
        customerFiscalMonth: p.customer?.customerFiscalMonth ?? '',
        customerFolderUrl: p.customer?.customerFolderUrl ?? '',
        partnerCode: p.partner?.partnerCode ?? '',
        partnerName: p.partner?.partnerName ?? '',
        partnerSalutation: p.partner?.partnerSalutation ?? '',
        partnerFolderUrl: p.partner?.partnerFolderUrl ?? '',
        businessName: p.business?.businessName ?? '',
        projectSalesStatus: p.projectSalesStatus,
        projectSalesStatusLabel: statusLabel,
        projectExpectedCloseMonth: p.projectExpectedCloseMonth ?? '',
        projectAssignedUserName: p.projectAssignedUserName ?? '',
        projectNotes: p.projectNotes ?? '',
        portalVisible: p.portalVisible === false ? '非表示' : '表示',
        projectIsActive: p.projectIsActive ? '1' : '0',
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };

      // 動的フィールドを追加（案件カスタム）
      for (const field of projectFields) {
        if (field.type === 'formula') continue;
        rowData[field.key] = customData?.[field.key] ?? '';
      }
      // formula フィールドの計算値を追加
      if (projectFields.some((f) => f.type === 'formula')) {
        const formulaResults = computeAllFormulas(projectFields, customData);
        for (const [k, v] of Object.entries(formulaResults)) {
          rowData[k] = v ?? '';
        }
      }

      // 顧客 showOnProject カスタムフィールドを追加
      const customerLinks = (p.customer?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
      const customerLink = customerLinks.find((l) => l.businessId === p.businessId);
      const customerLinkData = (customerLink?.linkCustomData ?? {}) as Record<string, unknown>;
      for (const field of customerShowFields) {
        rowData[`customerLink_${field.key}`] = customerLinkData[field.key] ?? '';
      }

      // 代理店 showOnProject カスタムフィールドを追加
      const partnerLinks = (p.partner?.businessLinks ?? []) as Array<{ businessId: number; linkCustomData: unknown }>;
      const partnerLink = partnerLinks.find((l) => l.businessId === p.businessId);
      const partnerLinkData = (partnerLink?.linkCustomData ?? {}) as Record<string, unknown>;
      for (const field of partnerShowFields) {
        rowData[`partnerLink_${field.key}`] = partnerLinkData[field.key] ?? '';
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
      '顧客呼称': 'customerSalutation',
      '顧客種別': 'customerType',
      '顧客代表者': 'customerRepresentativeName',
      '顧客WEBサイト': 'customerWebsite',
      '顧客決算月': 'customerFiscalMonth',
      '顧客フォルダURL': 'customerFolderUrl',
      '代理店コード': 'partnerCode',
      '代理店名': 'partnerName',
      '代理店呼称': 'partnerSalutation',
      '代理店フォルダURL': 'partnerFolderUrl',
      '営業ステータス': 'projectSalesStatus',
      '営業ステータスコード': 'projectSalesStatus',
      '受注予定月': 'projectExpectedCloseMonth',
      '担当者名': 'projectAssignedUserName',
      '備考': 'projectNotes',
      'ポータル表示': 'portalVisible',
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

          // 動的フィールドデータの構築（formula型はスキップ）
          const customData: Record<string, unknown> = {};
          for (const field of projectFields) {
            if (field.type === 'formula') continue;
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

          // formula フィールドの計算結果を注入
          if (projectFields.some((f) => f.type === 'formula')) {
            const formulaResults = computeAllFormulas(projectFields, customData);
            for (const [k, v] of Object.entries(formulaResults)) {
              customData[k] = v;
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
            // 顧客×事業リンクを自動作成（未存在の場合のみ）
            await tx.customerBusinessLink.upsert({
              where: { customerId_businessId: { customerId: customer.id, businessId } },
              update: {},
              create: { customerId: customer.id, businessId, linkStatus: 'active' },
            });
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

              // マージ後の formula 再計算
              if (projectFields.some((f) => f.type === 'formula')) {
                const formulaResults = computeAllFormulas(projectFields, mergedCustomData);
                for (const [k, v] of Object.entries(formulaResults)) {
                  mergedCustomData[k] = v;
                }
              }

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
              // 顧客×事業リンクを自動作成（未存在の場合のみ）
              await tx.customerBusinessLink.upsert({
                where: { customerId_businessId: { customerId: customer.id, businessId } },
                update: {},
                create: { customerId: customer.id, businessId, linkStatus: 'active' },
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
              // 顧客×事業リンクを自動作成（未存在の場合のみ）
              await tx.customerBusinessLink.upsert({
                where: { customerId_businessId: { customerId: customer.id, businessId } },
                update: {},
                create: { customerId: customer.id, businessId, linkStatus: 'active' },
              });
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
