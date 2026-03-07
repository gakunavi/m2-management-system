import type { PrismaClient } from '@prisma/client';
import type { RevenueRecognition, KpiDefinition } from '@/types/dashboard';

// ============================================
// 年度ヘルパー
// ============================================

/**
 * 年度の12ヶ月配列を生成（4月始まり）
 * year=2025 → ["2025-04", "2025-05", ..., "2026-03"]
 */
export function getFiscalYearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 4;
    const y = month > 12 ? year + 1 : year;
    const m = month > 12 ? month - 12 : month;
    return `${y}-${String(m).padStart(2, '0')}`;
  });
}

/**
 * 現在の年度を取得
 * 1〜3月 → 前年度、4〜12月 → 当年度
 */
export function getCurrentFiscalYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * 現在の年月を YYYY-MM 形式で返す
 */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 前月を YYYY-MM 形式で返す
 */
export function getPreviousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * 月ラベルを生成 ("2025-04" → "4月")
 */
export function getMonthLabel(month: string): string {
  const m = parseInt(month.split('-')[1], 10);
  return `${m}月`;
}

// ============================================
// 売上計上ヘルパー
// ============================================

interface ProjectForRevenue {
  id: number;
  projectExpectedCloseMonth: string | null;
  projectCustomData: unknown;
}

/**
 * 案件の計上月を取得
 */
export function getRevenueMonth(
  project: ProjectForRevenue,
  dateField: string,
): string | null {
  if (dateField === 'projectExpectedCloseMonth') {
    return project.projectExpectedCloseMonth;
  }

  const customData = project.projectCustomData as Record<string, unknown>;
  const value = customData?.[dateField];

  if (!value || typeof value !== 'string') return null;

  // date型 "YYYY-MM-DD" → "YYYY-MM"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.substring(0, 7);
  }

  // month型 "YYYY-MM"
  if (/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  return null;
}

/**
 * 案件の売上金額を取得
 */
export function getRevenueAmount(
  project: ProjectForRevenue,
  amountField: string,
): number {
  const customData = project.projectCustomData as Record<string, unknown>;
  const value = customData?.[amountField];
  return typeof value === 'number' ? value : 0;
}

// ============================================
// 売上実績集計
// ============================================

export interface MonthlyRevenue {
  month: string;
  actualAmount: number;
  projectCount: number;
}

/**
 * 事業の月別売上実績を集計する
 */
export async function calculateMonthlyRevenue(
  prisma: PrismaClient,
  businessId: number,
  revenueRecognition: RevenueRecognition,
  startMonth: string,
  endMonth: string,
  partnerIds?: number[],
): Promise<MonthlyRevenue[]> {
  const where: Record<string, unknown> = {
    businessId,
    projectSalesStatus: revenueRecognition.statusCode,
    projectIsActive: true,
  };

  if (partnerIds) {
    where.partnerId = { in: partnerIds };
  }

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      projectExpectedCloseMonth: true,
      projectCustomData: true,
    },
  });

  const monthMap = new Map<string, { amount: number; count: number }>();

  for (const project of projects) {
    const month = getRevenueMonth(project, revenueRecognition.dateField);
    const amount = getRevenueAmount(project, revenueRecognition.amountField);

    if (!month || month < startMonth || month > endMonth) continue;

    const entry = monthMap.get(month) || { amount: 0, count: 0 };
    entry.amount += amount;
    entry.count += 1;
    monthMap.set(month, entry);
  }

  return Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    actualAmount: data.amount,
    projectCount: data.count,
  }));
}

/**
 * 単月の売上実績を集計する
 */
export async function calculateMonthRevenue(
  prisma: PrismaClient,
  businessId: number,
  revenueRecognition: RevenueRecognition,
  targetMonth: string,
): Promise<{ actualAmount: number; projectCount: number }> {
  const results = await calculateMonthlyRevenue(
    prisma,
    businessId,
    revenueRecognition,
    targetMonth,
    targetMonth,
  );
  return results[0] || { actualAmount: 0, projectCount: 0 };
}

// ============================================
// スコープヘルパー
// ============================================

/**
 * 代理店の自社+下位代理店のIDリストを取得（再帰）
 * ※マスタ階層（Partner.parentId）ベース
 */
export async function getPartnerScope(
  prisma: PrismaClient,
  partnerId: number,
): Promise<number[]> {
  const ids = [partnerId];

  async function collectChildren(parentId: number) {
    const children = await prisma.partner.findMany({
      where: { parentId, partnerIsActive: true },
      select: { id: true },
    });
    for (const child of children) {
      ids.push(child.id);
      await collectChildren(child.id);
    }
  }

  await collectChildren(partnerId);
  return ids;
}

/**
 * 事業別階層での代理店スコープを取得
 * PartnerBusinessLink の businessParentId チェーンを辿って子孫収集
 *
 * @param businessId 指定時はその事業の階層で子孫を収集、未指定時は全事業横断で収集
 */
export async function getBusinessPartnerScope(
  prisma: PrismaClient,
  partnerId: number,
  businessId?: number | null,
): Promise<number[]> {
  const ids = new Set<number>([partnerId]);

  const collectChildren = async (parentId: number): Promise<void> => {
    const where: Record<string, unknown> = {
      businessParentId: parentId,
      partner: { partnerIsActive: true },
    };
    if (businessId) {
      where.businessId = businessId;
    }

    const children = await prisma.partnerBusinessLink.findMany({
      where,
      select: { partnerId: true },
    });
    for (const child of children) {
      if (!ids.has(child.partnerId)) {
        ids.add(child.partnerId);
        await collectChildren(child.partnerId);
      }
    }
  };

  await collectChildren(partnerId);

  return Array.from(ids);
}

/**
 * ユーザーのアクセス可能な事業IDリストを取得
 */
export async function getBusinessIdsForUser(
  prisma: PrismaClient,
  user: { id: number; role: string; partnerId?: number | null },
): Promise<number[] | null> {
  // admin は全事業（null = フィルタなし）
  if (user.role === 'admin') return null;

  // staff はアサイン済み事業
  if (user.role === 'staff') {
    const assignments = await prisma.userBusinessAssignment.findMany({
      where: { userId: user.id },
      select: { businessId: true },
    });
    return assignments.map((a) => a.businessId);
  }

  // partner_admin / partner_staff は PartnerBusinessLink 経由
  if ((user.role === 'partner_admin' || user.role === 'partner_staff') && user.partnerId) {
    const links = await prisma.partnerBusinessLink.findMany({
      where: { partnerId: user.partnerId, linkStatus: 'active' },
      select: { businessId: true },
    });
    return links.map((l) => l.businessId);
  }

  return [];
}

/**
 * 事業の計上ルールを取得（後方互換）
 */
export function getRevenueRecognition(
  businessConfig: unknown,
): RevenueRecognition | null {
  const config = businessConfig as Record<string, unknown> | null;
  if (!config?.revenueRecognition) return null;

  const rr = config.revenueRecognition as Record<string, unknown>;
  if (!rr.statusCode || !rr.amountField || !rr.dateField) return null;

  return {
    statusCode: rr.statusCode as string,
    amountField: rr.amountField as string,
    dateField: rr.dateField as string,
  };
}

// ============================================
// 複数 KPI ヘルパー
// ============================================

/**
 * 事業の KPI 定義一覧を取得
 * kpiDefinitions があればそれを返す。なければ旧 revenueRecognition から変換
 */
export function getKpiDefinitions(businessConfig: unknown): KpiDefinition[] {
  const config = businessConfig as Record<string, unknown> | null;

  if (config?.kpiDefinitions && Array.isArray(config.kpiDefinitions)) {
    return (config.kpiDefinitions as KpiDefinition[]).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
  }

  // 旧フォーマット: revenueRecognition → KpiDefinition に変換
  const rr = getRevenueRecognition(businessConfig);
  if (rr) {
    return [
      {
        key: 'revenue',
        label: '売上金額',
        unit: '円',
        aggregation: 'sum',
        sourceField: rr.amountField,
        statusFilter: rr.statusCode,
        dateField: rr.dateField,
        isPrimary: true,
        sortOrder: 0,
      },
    ];
  }

  return [];
}

/**
 * 特定の KPI 定義を取得
 */
export function getKpiDefinition(
  businessConfig: unknown,
  kpiKey: string,
): KpiDefinition | null {
  const defs = getKpiDefinitions(businessConfig);
  return defs.find((d) => d.key === kpiKey) ?? null;
}

/**
 * プライマリ KPI 定義を取得
 */
export function getPrimaryKpiDefinition(
  businessConfig: unknown,
): KpiDefinition | null {
  const defs = getKpiDefinitions(businessConfig);
  return defs.find((d) => d.isPrimary) ?? defs[0] ?? null;
}

// ============================================
// KPI 実績集計（汎用）
// ============================================

export interface KpiMonthlyActual {
  month: string;
  actualValue: number;
  projectCount: number;
}

/**
 * KPI 定義に基づく月別実績を集計する
 * aggregation='sum' → sourceField の値を合計
 * aggregation='count' → 条件に合致するプロジェクト数をカウント
 */
export async function calculateKpiMonthlyActuals(
  prisma: PrismaClient,
  businessId: number,
  kpi: KpiDefinition,
  startMonth: string,
  endMonth: string,
  partnerIds?: number[],
): Promise<KpiMonthlyActual[]> {
  const where: Record<string, unknown> = {
    businessId,
    projectIsActive: true,
  };

  if (kpi.statusFilter) {
    where.projectSalesStatus = Array.isArray(kpi.statusFilter)
      ? { in: kpi.statusFilter }
      : kpi.statusFilter;
  }

  if (partnerIds) {
    where.partnerId = { in: partnerIds };
  }

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      projectExpectedCloseMonth: true,
      projectCustomData: true,
    },
  });

  const monthMap = new Map<string, { value: number; count: number }>();

  for (const project of projects) {
    const month = getRevenueMonth(project, kpi.dateField);
    if (!month || month < startMonth || month > endMonth) continue;

    const entry = monthMap.get(month) || { value: 0, count: 0 };

    if (kpi.aggregation === 'sum' && kpi.sourceField) {
      entry.value += getRevenueAmount(project, kpi.sourceField);
    } else if (kpi.aggregation === 'count') {
      entry.value += 1;
    }

    entry.count += 1;
    monthMap.set(month, entry);
  }

  return Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    actualValue: data.value,
    projectCount: data.count,
  }));
}

/**
 * 単月の KPI 実績を集計する
 */
export async function calculateKpiMonthActual(
  prisma: PrismaClient,
  businessId: number,
  kpi: KpiDefinition,
  targetMonth: string,
): Promise<{ actualValue: number; projectCount: number }> {
  const results = await calculateKpiMonthlyActuals(
    prisma,
    businessId,
    kpi,
    targetMonth,
    targetMonth,
  );
  return results[0] || { actualValue: 0, projectCount: 0 };
}

// ============================================
// KPI 一括計算（N+1 クエリ回避）
// ============================================

/**
 * 事業の全 KPI 実績を一括計算する。
 * 1 回の findMany で全案件を取得し、メモリ内で各 KPI を計算。
 * @returns kpiKey → month → { actualValue, projectCount }
 */
export async function calculateKpiBatchForBusiness(
  prisma: PrismaClient,
  businessId: number,
  kpis: KpiDefinition[],
  targetMonths: string[],
): Promise<Map<string, Map<string, { actualValue: number; projectCount: number }>>> {
  // 全アクティブ案件を 1 クエリで取得
  const projects = await prisma.project.findMany({
    where: {
      businessId,
      projectIsActive: true,
    },
    select: {
      id: true,
      projectSalesStatus: true,
      projectExpectedCloseMonth: true,
      projectCustomData: true,
    },
  });

  const result = new Map<string, Map<string, { actualValue: number; projectCount: number }>>();

  for (const kpi of kpis) {
    const monthMap = new Map<string, { actualValue: number; projectCount: number }>();

    for (const project of projects) {
      // ステータスフィルター（配列対応）
      if (kpi.statusFilter) {
        const filters = Array.isArray(kpi.statusFilter) ? kpi.statusFilter : [kpi.statusFilter];
        if (!filters.includes(project.projectSalesStatus)) continue;
      }

      const month = getRevenueMonth(
        project as unknown as ProjectForRevenue,
        kpi.dateField,
      );
      if (!month || !targetMonths.includes(month)) continue;

      const entry = monthMap.get(month) || { actualValue: 0, projectCount: 0 };

      if (kpi.aggregation === 'sum' && kpi.sourceField) {
        entry.actualValue += getRevenueAmount(
          project as unknown as ProjectForRevenue,
          kpi.sourceField,
        );
      } else if (kpi.aggregation === 'count') {
        entry.actualValue += 1;
      }

      entry.projectCount += 1;
      monthMap.set(month, entry);
    }

    result.set(kpi.key, monthMap);
  }

  return result;
}
