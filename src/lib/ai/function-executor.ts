// ============================================
// AI アシスタント: Function 実行エンジン
// Prisma 直接クエリで既存データを取得
// ============================================

import { prisma } from '@/lib/prisma';
import {
  getCurrentMonth,
  getPreviousMonth,
  getCurrentFiscalYear,
  getFiscalYearMonths,
  getMonthLabel,
  getBusinessIdsForUser,
  getKpiDefinitions,
  getPrimaryKpiDefinition,
  getActiveFieldKeys,
  calculateKpiBatchForBusiness,
  calculateKpiMonthlyActuals,
  getRevenueAmount,
  getRevenueMonth,
  injectFormulaValues,
} from '@/lib/revenue-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

interface UserContext {
  id: number;
  role: string;
  partnerId?: number | null;
}

// ============================================
// get_kpi_summary
// ============================================

export async function executeGetKpiSummary(
  args: { month?: string; business_id?: number },
  user: UserContext,
): Promise<string> {
  const month = args.month ?? getCurrentMonth();
  const prevMonth = getPreviousMonth(month);
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const businessWhere: Record<string, unknown> = { businessIsActive: true };
  if (args.business_id) {
    businessWhere.id = args.business_id;
  } else if (allowedIds !== null) {
    businessWhere.id = { in: allowedIds };
  }

  const businesses = await prisma.business.findMany({
    where: businessWhere,
    select: { id: true, businessName: true, businessConfig: true },
  });

  if (businesses.length === 0) return JSON.stringify({ message: '対象事業が見つかりません' });

  const results: Record<string, unknown>[] = [];

  for (const biz of businesses) {
    const activeKeys = getActiveFieldKeys(biz.businessConfig);
    const kpiDefs = getKpiDefinitions(biz.businessConfig).filter(
      (k) => !(k.aggregation === 'sum' && k.sourceField && !activeKeys.has(k.sourceField)),
    );
    if (kpiDefs.length === 0) continue;

    const bizConfig = biz.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projFields = bizConfig?.projectFields ?? [];
    const hasFormula = projFields.some((f) => f.type === 'formula');

    const batchResult = await calculateKpiBatchForBusiness(
      prisma, biz.id, kpiDefs, [month, prevMonth], hasFormula ? projFields : undefined,
    );

    for (const kpi of kpiDefs) {
      const monthMap = batchResult.get(kpi.key);
      const cur = monthMap?.get(month) || { actualValue: 0, projectCount: 0 };
      const prev = monthMap?.get(prevMonth) || { actualValue: 0, projectCount: 0 };

      results.push({
        businessName: biz.businessName,
        kpiLabel: kpi.label,
        kpiUnit: kpi.unit,
        currentMonth: month,
        currentValue: cur.actualValue,
        currentCount: cur.projectCount,
        previousMonth: prevMonth,
        previousValue: prev.actualValue,
        previousCount: prev.projectCount,
      });
    }
  }

  // 総案件数
  const projectWhere: Record<string, unknown> = { projectIsActive: true };
  if (args.business_id) {
    projectWhere.businessId = args.business_id;
  } else if (allowedIds !== null) {
    projectWhere.businessId = { in: allowedIds };
  }
  const totalProjects = await prisma.project.count({ where: projectWhere });

  // 目標
  const targetWhere: Record<string, unknown> = { targetMonth: { in: [month, prevMonth] } };
  if (args.business_id) {
    targetWhere.businessId = args.business_id;
  } else if (allowedIds !== null) {
    targetWhere.businessId = { in: allowedIds };
  }
  const salesTargets = await prisma.salesTarget.findMany({ where: targetWhere });

  const targetByKpi: Record<string, number> = {};
  for (const t of salesTargets) {
    if (t.kpiKey && t.targetMonth === month) {
      targetByKpi[t.kpiKey] = (targetByKpi[t.kpiKey] ?? 0) + Number(t.targetAmount);
    }
  }

  return JSON.stringify({ kpiResults: results, totalProjects, targets: targetByKpi });
}

// ============================================
// get_pipeline
// ============================================

export async function executeGetPipeline(
  args: { month?: string; business_id?: number },
  user: UserContext,
): Promise<string> {
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const businessWhere: Record<string, unknown> = { businessIsActive: true };
  if (args.business_id) {
    businessWhere.id = args.business_id;
  } else if (allowedIds !== null) {
    businessWhere.id = { in: allowedIds };
  }

  const businesses = await prisma.business.findMany({
    where: businessWhere,
    select: { id: true, businessConfig: true },
  });

  // ステータス定義を取得
  const businessIds = businesses.map((b) => b.id);
  const statusDefs = await prisma.businessStatusDefinition.findMany({
    where: { businessId: { in: businessIds } },
    orderBy: { statusSortOrder: 'asc' },
  });

  // KPI定義を解決
  let resolvedKpi = null;
  for (const biz of businesses) {
    resolvedKpi = getPrimaryKpiDefinition(biz.businessConfig);
    if (resolvedKpi) break;
  }

  // 案件取得
  const projectWhere: Record<string, unknown> = {
    projectIsActive: true,
    businessId: { in: businessIds },
  };
  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: {
      id: true,
      projectSalesStatus: true,
      projectCustomData: true,
      projectExpectedCloseMonth: true,
    },
  });

  // ステータス別集計
  const statusMap = new Map<string, { label: string; color: string; sortOrder: number; count: number; amount: number }>();
  for (const sd of statusDefs) {
    if (!statusMap.has(sd.statusCode)) {
      statusMap.set(sd.statusCode, {
        label: sd.statusLabel,
        color: sd.statusColor ?? '#888',
        sortOrder: sd.statusSortOrder ?? 0,
        count: 0,
        amount: 0,
      });
    }
  }

  for (const proj of projects) {
    const status = proj.projectSalesStatus;
    if (!status) continue;
    const entry = statusMap.get(status);
    if (entry) {
      entry.count += 1;
      if (resolvedKpi && resolvedKpi.aggregation === 'sum' && resolvedKpi.sourceField) {
        entry.amount += getRevenueAmount(proj, resolvedKpi.sourceField);
      }
    }
  }

  const statuses = Array.from(statusMap.entries())
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([code, s]) => ({
      statusCode: code,
      statusLabel: s.label,
      projectCount: s.count,
      totalAmount: s.amount,
    }));

  return JSON.stringify({
    statuses,
    total: {
      projectCount: projects.length,
      totalAmount: statuses.reduce((sum, s) => sum + s.totalAmount, 0),
    },
    kpiLabel: resolvedKpi?.label ?? '売上',
    kpiUnit: resolvedKpi?.unit ?? '円',
  });
}

// ============================================
// get_partner_ranking
// ============================================

export async function executeGetPartnerRanking(
  args: { month?: string; business_id: number; limit?: number },
  user: UserContext,
): Promise<string> {
  const limit = args.limit ?? 20;
  const allowedIds = await getBusinessIdsForUser(prisma, user);
  if (allowedIds !== null && !allowedIds.includes(args.business_id)) {
    return JSON.stringify({ error: 'この事業へのアクセス権がありません' });
  }

  const biz = await prisma.business.findUnique({
    where: { id: args.business_id },
    select: { businessConfig: true },
  });
  if (!biz) return JSON.stringify({ error: '事業が見つかりません' });

  const activeKeys = getActiveFieldKeys(biz.businessConfig);
  const kpiDefs = getKpiDefinitions(biz.businessConfig).filter(
    (k) => !(k.aggregation === 'sum' && k.sourceField && !activeKeys.has(k.sourceField)),
  );
  const kpi = kpiDefs.find((k) => k.isPrimary) ?? kpiDefs[0];
  if (!kpi) return JSON.stringify({ error: 'KPI定義がありません' });

  const projects = await prisma.project.findMany({
    where: { businessId: args.business_id, projectIsActive: true },
    select: {
      id: true,
      projectSalesStatus: true,
      projectCustomData: true,
      projectExpectedCloseMonth: true,
      partnerId: true,
      partner: { select: { id: true, partnerName: true } },
    },
  });

  // formula フィールド注入
  const bizConfig = biz.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
  const projFields = bizConfig?.projectFields ?? [];
  if (projFields.some((f) => f.type === 'formula')) {
    injectFormulaValues(projects as unknown as Array<{ projectCustomData: unknown }>, projFields);
  }

  // statusFilter 適用
  const statusFilter = kpi.statusFilter
    ? (Array.isArray(kpi.statusFilter) ? kpi.statusFilter : [kpi.statusFilter])
    : null;

  const partnerMap = new Map<number, { name: string; amount: number; count: number }>();

  for (const proj of projects) {
    if (statusFilter && !statusFilter.includes(proj.projectSalesStatus ?? '')) continue;
    if (args.month) {
      const revenueMonth = getRevenueMonth(proj, kpi.dateField);
      if (revenueMonth !== args.month) continue;
    }

    const pid = proj.partnerId ?? 0;
    const pname = proj.partner?.partnerName ?? '直販';
    const entry = partnerMap.get(pid) ?? { name: pname, amount: 0, count: 0 };

    if (kpi.aggregation === 'sum' && kpi.sourceField) {
      entry.amount += getRevenueAmount(proj, kpi.sourceField);
    } else {
      entry.amount += 1;
    }
    entry.count += 1;
    partnerMap.set(pid, entry);
  }

  const rankings = Array.from(partnerMap.entries())
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, limit)
    .map(([id, data], i) => ({
      rank: i + 1,
      partnerId: id || null,
      partnerName: data.name,
      totalAmount: data.amount,
      projectCount: data.count,
    }));

  return JSON.stringify({
    rankings,
    kpiLabel: kpi.label,
    kpiUnit: kpi.unit,
  });
}

// ============================================
// get_revenue_trend
// ============================================

export async function executeGetRevenueTrend(
  args: { year?: number; business_id?: number },
  user: UserContext,
): Promise<string> {
  const year = args.year ?? getCurrentFiscalYear();
  const months = getFiscalYearMonths(year);
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const businessWhere: Record<string, unknown> = { businessIsActive: true };
  if (args.business_id) {
    businessWhere.id = args.business_id;
  } else if (allowedIds !== null) {
    businessWhere.id = { in: allowedIds };
  }

  const businesses = await prisma.business.findMany({
    where: businessWhere,
    select: { id: true, businessConfig: true },
  });

  // KPI解決
  let resolvedKpi = null;
  for (const biz of businesses) {
    resolvedKpi = getPrimaryKpiDefinition(biz.businessConfig);
    if (resolvedKpi) break;
  }
  if (!resolvedKpi) return JSON.stringify({ message: 'KPI定義がありません' });

  // 月別実績集計
  const monthlyTotals = new Map<string, number>();
  for (const m of months) monthlyTotals.set(m, 0);

  for (const biz of businesses) {
    const activeKeys = getActiveFieldKeys(biz.businessConfig);
    const kpiDef = getKpiDefinitions(biz.businessConfig)
      .filter((k) => !(k.aggregation === 'sum' && k.sourceField && !activeKeys.has(k.sourceField)))
      .find((k) => k.key === resolvedKpi!.key);
    if (!kpiDef) continue;

    const bizConfig = biz.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projFields = bizConfig?.projectFields ?? [];
    const hasFormula = projFields.some((f) => f.type === 'formula');

    const actuals = await calculateKpiMonthlyActuals(
      prisma, biz.id, kpiDef, months[0], months[months.length - 1],
      undefined, hasFormula ? projFields : undefined,
    );
    for (const a of actuals) {
      monthlyTotals.set(a.month, (monthlyTotals.get(a.month) ?? 0) + a.actualValue);
    }
  }

  // 目標取得
  const targetWhere: Record<string, unknown> = {
    targetMonth: { in: months },
    kpiKey: resolvedKpi.key,
  };
  if (args.business_id) {
    targetWhere.businessId = args.business_id;
  } else if (allowedIds !== null) {
    targetWhere.businessId = { in: allowedIds };
  }
  const targets = await prisma.salesTarget.findMany({ where: targetWhere });

  const targetByMonth = new Map<string, number>();
  for (const t of targets) {
    targetByMonth.set(t.targetMonth, (targetByMonth.get(t.targetMonth) ?? 0) + Number(t.targetAmount));
  }

  const trendData = months.map((m) => ({
    month: m,
    monthLabel: getMonthLabel(m),
    actualAmount: monthlyTotals.get(m) ?? 0,
    targetAmount: targetByMonth.get(m) ?? 0,
  }));

  return JSON.stringify({
    year,
    kpiLabel: resolvedKpi.label,
    kpiUnit: resolvedKpi.unit,
    months: trendData,
  });
}

// ============================================
// get_project_list
// ============================================

export async function executeGetProjectList(
  args: { business_id?: number; status?: string; search?: string; limit?: number },
  user: UserContext,
): Promise<string> {
  const limit = Math.min(50, args.limit ?? 20);
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const where: Record<string, unknown> = { projectIsActive: true };
  if (args.business_id) {
    where.businessId = args.business_id;
  } else if (allowedIds !== null) {
    where.businessId = { in: allowedIds };
  }
  if (args.status) {
    where.projectSalesStatus = args.status;
  }

  if (args.search) {
    where.OR = [
      { projectNo: { contains: args.search, mode: 'insensitive' } },
      { customer: { customerName: { contains: args.search, mode: 'insensitive' } } },
      { partner: { partnerName: { contains: args.search, mode: 'insensitive' } } },
    ];
  }

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      projectNo: true,
      projectSalesStatus: true,
      projectExpectedCloseMonth: true,
      projectCustomData: true,
      customer: { select: { customerName: true } },
      partner: { select: { partnerName: true } },
      business: { select: { businessName: true } },
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  // ステータスラベルを取得
  const statusDefs = await prisma.businessStatusDefinition.findMany({
    where: args.business_id ? { businessId: args.business_id } : {},
  });
  const statusLabelMap = new Map<string, string>();
  for (const sd of statusDefs) {
    statusLabelMap.set(sd.statusCode, sd.statusLabel);
  }

  const result = projects.map((p) => ({
    projectNo: p.projectNo,
    customerName: p.customer?.customerName ?? '-',
    partnerName: p.partner?.partnerName ?? '直販',
    businessName: p.business?.businessName ?? '-',
    status: statusLabelMap.get(p.projectSalesStatus ?? '') ?? p.projectSalesStatus ?? '-',
    expectedCloseMonth: p.projectExpectedCloseMonth ?? '-',
    updatedAt: p.updatedAt.toISOString().slice(0, 10),
  }));

  return JSON.stringify({ projects: result, totalShown: result.length });
}

// ============================================
// get_project_detail
// ============================================

export async function executeGetProjectDetail(
  args: { project_no: string },
  user: UserContext,
): Promise<string> {
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const where: Record<string, unknown> = { projectNo: args.project_no };
  if (allowedIds !== null) {
    where.businessId = { in: allowedIds };
  }

  const project = await prisma.project.findFirst({
    where,
    include: {
      customer: { select: { customerName: true, customerCode: true } },
      partner: { select: { partnerName: true, partnerCode: true } },
      business: { select: { businessName: true, businessConfig: true } },
      assignedUser: { select: { userName: true } },
      movements: {
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          template: { select: { stepName: true, stepNumber: true } },
        },
      },
    },
  });

  if (!project) return JSON.stringify({ error: `案件番号 ${args.project_no} が見つかりません` });

  // ステータスラベル
  const statusDef = await prisma.businessStatusDefinition.findFirst({
    where: { businessId: project.businessId, statusCode: project.projectSalesStatus ?? '' },
  });

  // カスタムフィールドのラベルマッピング
  const bizConfig = project.business?.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
  const fieldDefs = bizConfig?.projectFields ?? [];
  const customData = (project.projectCustomData ?? {}) as Record<string, unknown>;

  const customFields: Record<string, unknown> = {};
  for (const fd of fieldDefs) {
    const val = customData[fd.key];
    if (val !== undefined && val !== null && val !== '') {
      customFields[fd.label] = val;
    }
  }

  // ムーブメント情報
  const movements = project.movements.map((m) => ({
    step: m.template?.stepName ?? '-',
    status: m.movementStatus,
    completedAt: m.movementCompletedAt?.toISOString().slice(0, 10) ?? null,
    updatedAt: m.updatedAt.toISOString().slice(0, 10),
  }));

  return JSON.stringify({
    projectNo: project.projectNo,
    customerName: project.customer?.customerName ?? '-',
    customerCode: project.customer?.customerCode ?? '-',
    partnerName: project.partner?.partnerName ?? '直販',
    partnerCode: project.partner?.partnerCode ?? '-',
    businessName: project.business?.businessName ?? '-',
    status: statusDef?.statusLabel ?? project.projectSalesStatus ?? '-',
    expectedCloseMonth: project.projectExpectedCloseMonth ?? '-',
    assignedUser: project.assignedUser?.userName ?? '-',
    createdAt: project.createdAt.toISOString().slice(0, 10),
    updatedAt: project.updatedAt.toISOString().slice(0, 10),
    customFields,
    movements,
  });
}

// ============================================
// get_business_list
// ============================================

export async function executeGetBusinessList(
  _args: Record<string, never>,
  user: UserContext,
): Promise<string> {
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const where: Record<string, unknown> = { businessIsActive: true };
  if (allowedIds !== null) {
    where.id = { in: allowedIds };
  }

  const businesses = await prisma.business.findMany({
    where,
    select: { id: true, businessCode: true, businessName: true },
    orderBy: { businessSortOrder: 'asc' },
  });

  return JSON.stringify({ businesses });
}

// ============================================
// get_customer_list
// ============================================

export async function executeGetCustomerList(
  args: { search?: string; customer_type?: string; limit?: number },
  user: UserContext,
): Promise<string> {
  const limit = Math.min(50, args.limit ?? 20);
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const where: Record<string, unknown> = { customerIsActive: true };

  if (args.search) {
    where.OR = [
      { customerName: { contains: args.search, mode: 'insensitive' } },
      { customerCode: { contains: args.search, mode: 'insensitive' } },
    ];
  }
  if (args.customer_type) {
    where.customerType = args.customer_type;
  }

  // ユーザーのアクセス可能な事業に紐づく顧客のみ
  if (allowedIds !== null) {
    where.businessLinks = { some: { businessId: { in: allowedIds } } };
  }

  const customers = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      customerCode: true,
      customerName: true,
      customerType: true,
      customerPhone: true,
      customerEmail: true,
      industry: { select: { industryName: true } },
      businessLinks: {
        select: { business: { select: { businessName: true } } },
        take: 5,
      },
    },
    orderBy: { customerName: 'asc' },
    take: limit,
  });

  const totalCount = await prisma.customer.count({ where });

  const result = customers.map((c) => ({
    customerCode: c.customerCode,
    customerName: c.customerName,
    customerType: c.customerType,
    phone: c.customerPhone ?? '-',
    email: c.customerEmail ?? '-',
    industry: c.industry?.industryName ?? '-',
    businesses: c.businessLinks.map((bl) => bl.business.businessName).join(', ') || '-',
  }));

  return JSON.stringify({ customers: result, totalShown: result.length, totalCount });
}

// ============================================
// get_partner_list
// ============================================

export async function executeGetPartnerList(
  args: { search?: string; tier?: string; limit?: number },
  user: UserContext,
): Promise<string> {
  const limit = Math.min(50, args.limit ?? 20);
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const where: Record<string, unknown> = { partnerIsActive: true };

  if (args.search) {
    where.OR = [
      { partnerName: { contains: args.search, mode: 'insensitive' } },
      { partnerCode: { contains: args.search, mode: 'insensitive' } },
    ];
  }
  if (args.tier) {
    where.partnerTier = { contains: args.tier, mode: 'insensitive' };
  }

  // ユーザーのアクセス可能な事業に紐づく代理店のみ
  if (allowedIds !== null) {
    where.businessLinks = { some: { businessId: { in: allowedIds } } };
  }

  const partners = await prisma.partner.findMany({
    where,
    select: {
      id: true,
      partnerCode: true,
      partnerName: true,
      partnerTier: true,
      partnerTierNumber: true,
      partnerPhone: true,
      partnerEmail: true,
      parentId: true,
    },
    orderBy: { partnerName: 'asc' },
    take: limit,
  });

  const totalCount = await prisma.partner.count({ where });

  // 親代理店名を一括取得
  const parentIds = partners.map((p) => p.parentId).filter((id): id is number => id !== null);
  const parentMap = new Map<number, string>();
  if (parentIds.length > 0) {
    const parents = await prisma.partner.findMany({
      where: { id: { in: parentIds } },
      select: { id: true, partnerName: true },
    });
    for (const parent of parents) {
      parentMap.set(parent.id, parent.partnerName);
    }
  }

  const result = partners.map((p) => ({
    partnerCode: p.partnerCode,
    partnerName: p.partnerName,
    tier: p.partnerTier ?? '-',
    tierNumber: p.partnerTierNumber ?? '-',
    phone: p.partnerPhone ?? '-',
    email: p.partnerEmail ?? '-',
    parentName: p.parentId ? (parentMap.get(p.parentId) ?? '-') : '-',
  }));

  return JSON.stringify({ partners: result, totalShown: result.length, totalCount });
}

// ============================================
// get_kpi_comparison
// ============================================

export async function executeGetKpiComparison(
  args: { month_a: string; month_b: string; business_id?: number },
  user: UserContext,
): Promise<string> {
  const allowedIds = await getBusinessIdsForUser(prisma, user);

  const businessWhere: Record<string, unknown> = { businessIsActive: true };
  if (args.business_id) {
    businessWhere.id = args.business_id;
  } else if (allowedIds !== null) {
    businessWhere.id = { in: allowedIds };
  }

  const businesses = await prisma.business.findMany({
    where: businessWhere,
    select: { id: true, businessName: true, businessConfig: true },
  });

  if (businesses.length === 0) return JSON.stringify({ message: '対象事業が見つかりません' });

  const months = [args.month_a, args.month_b];
  const comparisons: Record<string, unknown>[] = [];

  for (const biz of businesses) {
    const activeKeys = getActiveFieldKeys(biz.businessConfig);
    const kpiDefs = getKpiDefinitions(biz.businessConfig).filter(
      (k) => !(k.aggregation === 'sum' && k.sourceField && !activeKeys.has(k.sourceField)),
    );
    if (kpiDefs.length === 0) continue;

    const bizConfig = biz.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
    const projFields = bizConfig?.projectFields ?? [];
    const hasFormula = projFields.some((f) => f.type === 'formula');

    const batchResult = await calculateKpiBatchForBusiness(
      prisma, biz.id, kpiDefs, months, hasFormula ? projFields : undefined,
    );

    for (const kpi of kpiDefs) {
      const monthMap = batchResult.get(kpi.key);
      const a = monthMap?.get(args.month_a) || { actualValue: 0, projectCount: 0 };
      const b = monthMap?.get(args.month_b) || { actualValue: 0, projectCount: 0 };
      const valueDiff = b.actualValue - a.actualValue;
      const countDiff = b.projectCount - a.projectCount;
      const changeRate = a.actualValue !== 0 ? ((valueDiff / a.actualValue) * 100) : (b.actualValue !== 0 ? 100 : 0);

      comparisons.push({
        businessName: biz.businessName,
        kpiLabel: kpi.label,
        kpiUnit: kpi.unit,
        monthA: args.month_a,
        monthAValue: a.actualValue,
        monthACount: a.projectCount,
        monthB: args.month_b,
        monthBValue: b.actualValue,
        monthBCount: b.projectCount,
        valueDiff,
        countDiff,
        changeRate: Math.round(changeRate * 10) / 10,
      });
    }
  }

  // 目標情報
  const targetWhere: Record<string, unknown> = { targetMonth: { in: months } };
  if (args.business_id) {
    targetWhere.businessId = args.business_id;
  } else if (allowedIds !== null) {
    targetWhere.businessId = { in: allowedIds };
  }
  const targets = await prisma.salesTarget.findMany({ where: targetWhere });

  const targetByMonthKpi: Record<string, number> = {};
  for (const t of targets) {
    if (t.kpiKey) {
      const key = `${t.targetMonth}_${t.kpiKey}`;
      targetByMonthKpi[key] = (targetByMonthKpi[key] ?? 0) + Number(t.targetAmount);
    }
  }

  return JSON.stringify({ comparisons, targets: targetByMonthKpi });
}

// ============================================
// get_partner_performance_change
// ============================================

export async function executeGetPartnerPerformanceChange(
  args: { month_a: string; month_b: string; business_id: number },
  user: UserContext,
): Promise<string> {
  const allowedIds = await getBusinessIdsForUser(prisma, user);
  if (allowedIds !== null && !allowedIds.includes(args.business_id)) {
    return JSON.stringify({ error: 'この事業へのアクセス権がありません' });
  }

  const biz = await prisma.business.findUnique({
    where: { id: args.business_id },
    select: { businessConfig: true },
  });
  if (!biz) return JSON.stringify({ error: '事業が見つかりません' });

  const activeKeys = getActiveFieldKeys(biz.businessConfig);
  const kpiDefs = getKpiDefinitions(biz.businessConfig).filter(
    (k) => !(k.aggregation === 'sum' && k.sourceField && !activeKeys.has(k.sourceField)),
  );
  const kpi = kpiDefs.find((k) => k.isPrimary) ?? kpiDefs[0];
  if (!kpi) return JSON.stringify({ error: 'KPI定義がありません' });

  const projects = await prisma.project.findMany({
    where: { businessId: args.business_id, projectIsActive: true },
    select: {
      id: true,
      projectSalesStatus: true,
      projectCustomData: true,
      projectExpectedCloseMonth: true,
      partnerId: true,
      partner: { select: { id: true, partnerName: true } },
    },
  });

  // formula注入
  const bizConfig = biz.businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
  const projFields = bizConfig?.projectFields ?? [];
  if (projFields.some((f) => f.type === 'formula')) {
    injectFormulaValues(projects as unknown as Array<{ projectCustomData: unknown }>, projFields);
  }

  const statusFilter = kpi.statusFilter
    ? (Array.isArray(kpi.statusFilter) ? kpi.statusFilter : [kpi.statusFilter])
    : null;

  // 月別・代理店別に集計
  const buildMonthMap = (targetMonth: string) => {
    const map = new Map<number, { name: string; amount: number; count: number }>();
    for (const proj of projects) {
      if (statusFilter && !statusFilter.includes(proj.projectSalesStatus ?? '')) continue;
      const revenueMonth = getRevenueMonth(proj, kpi.dateField);
      if (revenueMonth !== targetMonth) continue;

      const pid = proj.partnerId ?? 0;
      const pname = proj.partner?.partnerName ?? '直販';
      const entry = map.get(pid) ?? { name: pname, amount: 0, count: 0 };
      if (kpi.aggregation === 'sum' && kpi.sourceField) {
        entry.amount += getRevenueAmount(proj, kpi.sourceField);
      } else {
        entry.amount += 1;
      }
      entry.count += 1;
      map.set(pid, entry);
    }
    return map;
  };

  const mapA = buildMonthMap(args.month_a);
  const mapB = buildMonthMap(args.month_b);

  // 全代理店IDの集合
  const allPartnerIds = new Set(Array.from(mapA.keys()).concat(Array.from(mapB.keys())));

  const changes: Record<string, unknown>[] = [];
  for (const pid of Array.from(allPartnerIds)) {
    const a = mapA.get(pid) ?? { name: mapB.get(pid)?.name ?? '不明', amount: 0, count: 0 };
    const b = mapB.get(pid) ?? { name: a.name, amount: 0, count: 0 };
    const diff = b.amount - a.amount;
    const changeRate = a.amount !== 0 ? ((diff / a.amount) * 100) : (b.amount !== 0 ? 100 : 0);

    changes.push({
      partnerId: pid || null,
      partnerName: b.name || a.name,
      monthA: args.month_a,
      monthAAmount: a.amount,
      monthACount: a.count,
      monthB: args.month_b,
      monthBAmount: b.amount,
      monthBCount: b.count,
      amountDiff: diff,
      countDiff: b.count - a.count,
      changeRate: Math.round(changeRate * 10) / 10,
    });
  }

  // 変化率の絶対値が大きい順にソート
  changes.sort((a, b) => Math.abs(b.changeRate as number) - Math.abs(a.changeRate as number));

  return JSON.stringify({
    kpiLabel: kpi.label,
    kpiUnit: kpi.unit,
    partnerChanges: changes,
    summary: {
      totalPartners: changes.length,
      improved: changes.filter((c) => (c.amountDiff as number) > 0).length,
      declined: changes.filter((c) => (c.amountDiff as number) < 0).length,
      unchanged: changes.filter((c) => (c.amountDiff as number) === 0).length,
    },
  });
}

// ============================================
// メインディスパッチャー
// ============================================

export async function executeFunctionCall(
  functionName: string,
  args: Record<string, unknown>,
  user: UserContext,
): Promise<string> {
  switch (functionName) {
    case 'get_kpi_summary':
      return executeGetKpiSummary(args as { month?: string; business_id?: number }, user);
    case 'get_pipeline':
      return executeGetPipeline(args as { month?: string; business_id?: number }, user);
    case 'get_partner_ranking':
      return executeGetPartnerRanking(args as { month?: string; business_id: number; limit?: number }, user);
    case 'get_revenue_trend':
      return executeGetRevenueTrend(args as { year?: number; business_id?: number }, user);
    case 'get_project_list':
      return executeGetProjectList(args as { business_id?: number; status?: string; search?: string; limit?: number }, user);
    case 'get_project_detail':
      return executeGetProjectDetail(args as { project_no: string }, user);
    case 'get_business_list':
      return executeGetBusinessList({} as Record<string, never>, user);
    case 'get_customer_list':
      return executeGetCustomerList(args as { search?: string; customer_type?: string; limit?: number }, user);
    case 'get_partner_list':
      return executeGetPartnerList(args as { search?: string; tier?: string; limit?: number }, user);
    case 'get_kpi_comparison':
      return executeGetKpiComparison(args as { month_a: string; month_b: string; business_id?: number }, user);
    case 'get_partner_performance_change':
      return executeGetPartnerPerformanceChange(args as { month_a: string; month_b: string; business_id: number }, user);
    default:
      return JSON.stringify({ error: `未知の関数: ${functionName}` });
  }
}
