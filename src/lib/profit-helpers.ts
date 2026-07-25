import type { PrismaClient } from '@prisma/client';
import {
  getRevenueAmount,
  getRevenueMonth,
  getPrimaryKpiDefinition,
  injectFormulaValues,
} from '@/lib/revenue-helpers';
import {
  applyRewardSetting,
  computeProjectEntries,
  getStockActiveMonths,
  loadBusinessRewardContext,
  resolveCompanyShareBaseField,
  resolveProjectRewardSettings,
  resolveResponsibleAndParentLinks,
  toProjectRewardInput,
  compareMonth,
  type BusinessRewardContext,
  type ConfirmedProjectRow,
  type LinkRewardInput,
  type ProjectRewardInput,
  type RewardConfig,
} from '@/lib/reward-helpers';
import { formatRewardSetting, type RewardSetting } from '@/lib/reward-slots';
import {
  isCompanyShareConfigured,
  mergeCompanyShare,
  type CompanyShare,
} from '@/lib/company-share';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

// ============================================
// 収益（自社売上・粗利）計算
// ============================================
//
// 用語:
//   取扱高(GMV)   顧客が支払う総額
//   自社売上       取扱高 × 自社取り分（事業デフォルト→案件別上書きで解決）
//   代理店報酬     直紹介＋間接。税抜（消費税は預り金なので粗利から引かない）
//   粗利           自社売上 − 代理店報酬。粗利率 = 粗利 ÷ 自社売上
//
// 「経常利益」は販管費・営業外まで含む全社の数字で、事業別・案件別には配賦なしに
// 出せない。ここで扱うのは粗利（売上総利益）までとする。
//
// ── 計上基準について ──
// ダッシュボードは経理・締めのための画面ではなく、営業の見込みを見るための画面。
// そのため収益はダッシュボードの売上KPIと同じ参照先・同じ集計軸で計算する:
//   取扱高   = プライマリKPIの sourceField（例: 【合計】受注見込み金額）
//   計上月   = プライマリKPIの dateField（例: 受注予定月）
//   対象案件 = プライマリKPIの statusFilter に合致する案件
// これにより、ダッシュボードの「売上」カードと収益セクションの母集団が一致する。
//
// 一方、支払明細書（/rewards の締め）は revenueConfirmedAt を起点とする確定ベースの
// ままで、こちらは変更していない。ダッシュボード＝見込み、明細＝確定、と役割が違う。

// ============================================
// 計上基準（どのフィールド・どのステータスで計上するか）
// ============================================

export interface ProfitBasis {
  /** 取扱高を取るフィールド */
  sourceField: string | null;
  /** 計上月を決めるフィールド */
  dateField: string;
  /** 対象とする営業ステータス。null = 全ステータス */
  statusCodes: string[] | null;
  /** 表示用のKPIラベル */
  label: string;
}

/**
 * 事業の計上基準を解決する。プライマリKPI（＝売上KPI）を使う。
 *
 * KPIタブの選択には連動させない。台数などの数量KPIを選んだときに
 * 「台数 × 取り分」という無意味な計算になるのを防ぐため。
 * プライマリKPI以外を基準にしたい場合は、事業マスタの
 * 「取り分の基準金額フィールド」で明示的に指定する。
 */
export function resolveProfitBasis(businessConfig: unknown): ProfitBasis | null {
  const kpi = getPrimaryKpiDefinition(businessConfig);
  if (!kpi) return null;

  const statusCodes = kpi.statusFilter
    ? Array.isArray(kpi.statusFilter)
      ? kpi.statusFilter
      : [kpi.statusFilter]
    : null;

  return {
    // 数量KPI（aggregation='count'）は金額ではないので取扱高の基準にしない
    sourceField: kpi.aggregation === 'sum' ? kpi.sourceField : null,
    dateField: kpi.dateField,
    statusCodes,
    label: kpi.label,
  };
}

/** 案件フィールド定義を businessConfig から取り出す */
function getProjectFields(businessConfig: unknown): ProjectFieldDefinition[] {
  const config = businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
  return config?.projectFields ?? [];
}

/** その案件が計上対象か（ステータスが基準に合致するか） */
function isRecognized(row: ConfirmedProjectRow, basis: ProfitBasis): boolean {
  if (!basis.statusCodes) return true;
  return basis.statusCodes.includes(row.projectSalesStatus);
}

/** その案件の計上月（KPIの日付フィールドから）。null なら計上しない */
function recognitionMonthOf(project: ProjectRewardInput, basis: ProfitBasis): string | null {
  return getRevenueMonth(
    {
      id: project.id,
      projectExpectedCloseMonth: project.projectExpectedCloseMonth,
      projectCustomData: project.projectCustomData,
    },
    basis.dateField,
  );
}

/**
 * 計上月を revenueConfirmedMonth に差し替えた入力を作る。
 *
 * ストック展開（getStockActiveMonths）と報酬明細計算（computeProjectEntries）は
 * どちらも revenueConfirmedMonth を起点にしている。ダッシュボードでは
 * 収益確定日ではなくKPIの計上月を起点にしたいので、同じ関数を使い回すために
 * ここで起点だけを差し替える。解約日・固定期間の扱いは変わらない。
 */
function withRecognitionMonth(project: ProjectRewardInput, month: string): ProjectRewardInput {
  return { ...project, revenueConfirmedMonth: month, revenueConfirmedDay: null };
}

// ============================================
// 案件1件ぶんの収益（一覧列表示用）
// ============================================

/** 案件1件の報酬・自社売上・粗利。null は「未設定 or 計上対象外」 */
export interface ProjectFinancials {
  // --- 適用中の自社取り分（計上対象外の案件でも設定は表示できる）---
  companyShareShotLabel: string | null; // "20%" / "¥5,000"
  companyShareStockLabel: string | null;
  companyShareIsOverridden: boolean; // 案件別上書きが効いているか

  // --- ショット（計上月に1回）---
  rewardShotDirect: number | null;
  rewardShotIndirect: number | null;
  companyRevenueShot: number | null;
  grossProfitShot: number | null;
  grossMarginShot: number | null; // %

  // --- ストック（契約継続中は毎月。1ヶ月あたりの金額）---
  rewardStockDirect: number | null;
  rewardStockIndirect: number | null;
  companyRevenueStock: number | null;
  grossProfitStock: number | null;
  grossMarginStock: number | null; // %
}

/** 収益フィールドが全て空の値（設定の無い事業・計算対象外の案件用） */
export const EMPTY_FINANCIALS: ProjectFinancials = {
  companyShareShotLabel: null,
  companyShareStockLabel: null,
  companyShareIsOverridden: false,
  rewardShotDirect: null,
  rewardShotIndirect: null,
  companyRevenueShot: null,
  grossProfitShot: null,
  grossMarginShot: null,
  rewardStockDirect: null,
  rewardStockIndirect: null,
  companyRevenueStock: null,
  grossProfitStock: null,
  grossMarginStock: null,
};

/**
 * 代理店ロールに見せてはいけない収益フィールド（自社の取り分・売上・粗利）。
 * 代理店に支払う報酬額は従来どおり見せるが、自社がいくら抜いているかは社内情報。
 */
const COMPANY_ONLY_KEYS = [
  'companyShareShotLabel',
  'companyShareStockLabel',
  'companyRevenueShot',
  'companyRevenueStock',
  'grossProfitShot',
  'grossProfitStock',
  'grossMarginShot',
  'grossMarginStock',
] as const;

/**
 * 閲覧者に応じて収益フィールドを伏せる。
 * キー自体は残して値だけ null にする（一覧 GET と PATCH でキー集合を揃え、
 * インライン編集の行置換で列が消えるのを防ぐため）。
 */
export function visibleFinancials(
  financials: ProjectFinancials,
  canSee: boolean,
): ProjectFinancials {
  if (canSee) return financials;
  const masked = { ...financials, companyShareIsOverridden: false };
  for (const key of COMPANY_ONLY_KEYS) {
    masked[key] = null;
  }
  return masked;
}

/** 自社の収益（取り分・自社売上・粗利）を閲覧できるロールか */
export function canSeeCompanyRevenue(role: string): boolean {
  return role === 'admin' || role === 'staff';
}

/** 粗利率（%）。自社売上が 0 または未設定なら null（0除算・無意味な100%を避ける） */
function calcMargin(grossProfit: number | null, companyRevenue: number | null): number | null {
  if (grossProfit === null || companyRevenue === null || companyRevenue === 0) return null;
  return Math.round((grossProfit / companyRevenue) * 1000) / 10;
}

/** 案件に適用される自社取り分を解決（事業デフォルト → 案件別上書き） */
export function resolveProjectCompanyShare(
  config: RewardConfig,
  project: ProjectRewardInput,
): { share: CompanyShare; isOverridden: boolean } {
  const override = project.companyShareOverride;
  return {
    share: mergeCompanyShare(config.companyShare, override),
    isOverridden: isCompanyShareConfigured(override),
  };
}

/**
 * 案件1件の報酬・自社売上・粗利を計算する（純粋関数）。
 *
 * 金額は計上対象（KPIのステータス条件に合致し、計上月が決まる）案件でのみ算出する。
 * 対象外の案件は金額をすべて null にし、設定ラベルだけ返す
 * （一覧で取り分だけ確認できるように）。
 */
export function computeProjectFinancials(
  project: ProjectRewardInput,
  responsibleLink: LinkRewardInput | null,
  parentLink: LinkRewardInput | null,
  config: RewardConfig,
  basis: ProfitBasis | null,
  recognized: boolean,
): ProjectFinancials {
  const settings = resolveProjectRewardSettings(config, responsibleLink, parentLink, project);
  const { share, isOverridden } = resolveProjectCompanyShare(config, project);

  const revenueSource = {
    id: project.id,
    projectExpectedCloseMonth: project.projectExpectedCloseMonth,
    projectCustomData: project.projectCustomData,
  };
  const amountOf = (field: string | null) => (field ? getRevenueAmount(revenueSource, field) : 0);

  // 計上対象かつ計上月が決まる案件のみ金額を出す
  const countable =
    recognized && basis !== null && recognitionMonthOf(project, basis) !== null;
  const hasResponsible = project.partnerId != null;
  const hasParent = parentLink != null;

  // 取り分の基準は「事業設定の明示指定 → KPIのsourceField → 報酬の基準」の順で解決する
  const shotShareBase = amountOf(
    config.companyShare.shotBaseField ?? basis?.sourceField ?? config.shotBaseField,
  );
  const stockShareBase = amountOf(resolveCompanyShareBaseField(config, 'stock'));
  // 報酬の基準は従来どおり報酬設定のフィールド（KPIタブや取り分設定の影響を受けない）
  const shotRewardBase = amountOf(config.shotBaseField ?? basis?.sourceField ?? null);
  const stockRewardBase = amountOf(config.stockBaseField);

  const rewardOf = (
    setting: RewardSetting | undefined,
    hasPartner: boolean,
    base: number,
  ): number | null => (countable && hasPartner && setting ? applyRewardSetting(setting, base) : null);

  const revenueOf = (setting: RewardSetting | undefined, base: number): number | null =>
    countable && setting ? applyRewardSetting(setting, base) : null;

  const rewardShotDirect = rewardOf(settings.shotDirect, hasResponsible, shotRewardBase);
  const rewardShotIndirect = rewardOf(settings.shotIndirect, hasParent, shotRewardBase);
  const rewardStockDirect = rewardOf(settings.stockDirect, hasResponsible, stockRewardBase);
  const rewardStockIndirect = rewardOf(settings.stockIndirect, hasParent, stockRewardBase);

  const companyRevenueShot = revenueOf(share.shot, shotShareBase);
  const companyRevenueStock = revenueOf(share.stock, stockShareBase);

  const grossProfitShot =
    companyRevenueShot === null
      ? null
      : companyRevenueShot - (rewardShotDirect ?? 0) - (rewardShotIndirect ?? 0);
  const grossProfitStock =
    companyRevenueStock === null
      ? null
      : companyRevenueStock - (rewardStockDirect ?? 0) - (rewardStockIndirect ?? 0);

  return {
    companyShareShotLabel: share.shot ? formatRewardSetting(share.shot) : null,
    companyShareStockLabel: share.stock ? formatRewardSetting(share.stock) : null,
    companyShareIsOverridden: isOverridden,
    rewardShotDirect,
    rewardShotIndirect,
    companyRevenueShot,
    grossProfitShot,
    grossMarginShot: calcMargin(grossProfitShot, companyRevenueShot),
    rewardStockDirect,
    rewardStockIndirect,
    companyRevenueStock,
    grossProfitStock,
    grossMarginStock: calcMargin(grossProfitStock, companyRevenueStock),
  };
}

/** 事業の案件をまとめて計算するための前処理（formula の再計算を含む） */
function prepareContext(ctx: BusinessRewardContext): ProfitBasis | null {
  const fields = getProjectFields(ctx.businessConfig);
  // 【合計】受注見込み金額 のような formula フィールドを基準にできるよう、
  // 保存値ではなく計算し直した値を使う
  injectFormulaValues(ctx.projects, fields);
  return resolveProfitBasis(ctx.businessConfig);
}

/**
 * 案件一覧の列表示用: 事業内の案件それぞれの報酬・自社売上・粗利を計算する。
 * 計上対象外の案件も含めて返す（金額は null、取り分ラベルのみ）。
 */
export async function calculateProjectFinancialsByBusiness(
  prisma: PrismaClient,
  businessId: number,
): Promise<Map<number, ProjectFinancials>> {
  const result = new Map<number, ProjectFinancials>();
  const ctx = await loadBusinessRewardContext(prisma, businessId, { includeUnconfirmed: true });
  if (!ctx) return result;
  const basis = prepareContext(ctx);

  for (const row of ctx.projects) {
    const input = toProjectRewardInput(row);
    const { responsibleLink, parentLink } = resolveResponsibleAndParentLinks(row.partnerId, ctx.linkByPartner);
    result.set(
      row.id,
      computeProjectFinancials(
        input,
        responsibleLink,
        parentLink,
        ctx.config,
        basis,
        basis !== null && isRecognized(row, basis),
      ),
    );
  }
  return result;
}

/**
 * 案件1件ぶんの収益を計算する（GET詳細・PATCH レスポンス用）。
 *
 * 一覧 GET と同じキー集合を返すため、インライン編集で行を置換しても
 * 報酬・粗利の列が消えない。設定が無い事業では EMPTY_FINANCIALS を返す。
 */
export async function calculateProjectFinancials(
  prisma: PrismaClient,
  businessId: number,
  projectId: number,
): Promise<ProjectFinancials> {
  const ctx = await loadBusinessRewardContext(prisma, businessId, {
    includeUnconfirmed: true,
    projectIds: [projectId],
  });
  const row = ctx?.projects.find((p) => p.id === projectId);
  if (!ctx || !row) return EMPTY_FINANCIALS;
  const basis = prepareContext(ctx);

  const input = toProjectRewardInput(row);
  const { responsibleLink, parentLink } = resolveResponsibleAndParentLinks(row.partnerId, ctx.linkByPartner);
  return computeProjectFinancials(
    input,
    responsibleLink,
    parentLink,
    ctx.config,
    basis,
    basis !== null && isRecognized(row, basis),
  );
}

// ============================================
// 月次 P/L（ダッシュボード用）
// ============================================

/** 1ヶ月ぶんの収益サマリー。全てKPIの計上月ベース */
export interface MonthlyPL {
  month: string;
  gmv: number; // 取扱高
  companyRevenue: number; // 自社売上
  rewardDirect: number;
  rewardIndirect: number;
  rewardTotal: number;
  grossProfit: number;
  grossMargin: number | null; // %
  projectCount: number; // その月に計上があった案件数
}

/** 期間合計（月の内訳を持たない集計値） */
export type PLTotals = Omit<MonthlyPL, 'month'>;

function emptyBucket(month: string): MonthlyPL {
  return {
    month,
    gmv: 0,
    companyRevenue: 0,
    rewardDirect: 0,
    rewardIndirect: 0,
    rewardTotal: 0,
    grossProfit: 0,
    grossMargin: null,
    projectCount: 0,
  };
}

/**
 * 事業の月次 P/L を計上月ベースで計算する（純粋関数）。
 *
 * ショットは計上月に1回、ストックは契約継続中の各月に計上する。
 * ストックを毎月立てないと「報酬だけ毎月出て売上は初月だけ」となり、
 * 2ヶ月目以降の粗利が必ずマイナスになるため、売上側も報酬と同じ
 * 月リスト（getStockActiveMonths）で展開する。
 */
export function computeMonthlyPL(
  ctx: BusinessRewardContext,
  basis: ProfitBasis | null,
  fromMonth: string,
  toMonth: string,
): MonthlyPL[] {
  if (!basis) return [];

  const buckets = new Map<string, MonthlyPL>();
  const projectsInMonth = new Map<string, Set<number>>();

  const bucketFor = (month: string): MonthlyPL => {
    let b = buckets.get(month);
    if (!b) {
      b = emptyBucket(month);
      buckets.set(month, b);
    }
    return b;
  };
  const markProject = (month: string, projectId: number) => {
    let s = projectsInMonth.get(month);
    if (!s) {
      s = new Set<number>();
      projectsInMonth.set(month, s);
    }
    s.add(projectId);
  };

  for (const row of ctx.projects) {
    if (!isRecognized(row, basis)) continue;

    const base = toProjectRewardInput(row);
    const month = recognitionMonthOf(base, basis);
    if (!month) continue;

    const project = withRecognitionMonth(base, month);
    const { responsibleLink, parentLink } = resolveResponsibleAndParentLinks(row.partnerId, ctx.linkByPartner);
    const { share } = resolveProjectCompanyShare(ctx.config, project);

    const revenueSource = {
      id: project.id,
      projectExpectedCloseMonth: project.projectExpectedCloseMonth,
      projectCustomData: project.projectCustomData,
    };
    const amountOf = (field: string | null) => (field ? getRevenueAmount(revenueSource, field) : 0);

    // --- 売上側: ショット（計上月に1回）---
    if (compareMonth(month, fromMonth) >= 0 && compareMonth(month, toMonth) <= 0) {
      const b = bucketFor(month);
      b.gmv += amountOf(basis.sourceField);
      if (share.shot) {
        b.companyRevenue += applyRewardSetting(
          share.shot,
          amountOf(ctx.config.companyShare.shotBaseField ?? basis.sourceField ?? ctx.config.shotBaseField),
        );
      }
      markProject(month, project.id);
    }

    // --- 売上側: ストック（継続中の各月）---
    // 起点は withRecognitionMonth で計上月に差し替え済み
    const stockMonths = getStockActiveMonths(project, fromMonth, toMonth);
    if (stockMonths.length > 0) {
      const stockGmv = amountOf(ctx.config.stockBaseField);
      const stockRevenue = share.stock
        ? applyRewardSetting(share.stock, amountOf(resolveCompanyShareBaseField(ctx.config, 'stock')))
        : 0;
      // ストック設定も取り分も無い案件は月を立てない（空の月が並ぶのを防ぐ）
      if (stockGmv > 0 || stockRevenue > 0) {
        for (const m of stockMonths) {
          const b = bucketFor(m);
          b.gmv += stockGmv;
          b.companyRevenue += stockRevenue;
          markProject(m, project.id);
        }
      }
    }

    // --- 報酬側: 計上月で集計 ---
    const entries = computeProjectEntries(project, responsibleLink, parentLink, ctx.config, fromMonth, toMonth);
    for (const e of entries) {
      const b = bucketFor(e.sourceMonth);
      if (e.entryType === 'direct') b.rewardDirect += e.rewardAmount;
      else b.rewardIndirect += e.rewardAmount;
      markProject(e.sourceMonth, project.id);
    }
  }

  return Array.from(buckets.values())
    .map((b) => {
      const rewardTotal = b.rewardDirect + b.rewardIndirect;
      const grossProfit = b.companyRevenue - rewardTotal;
      return {
        ...b,
        rewardTotal,
        grossProfit,
        grossMargin: calcMargin(grossProfit, b.companyRevenue),
        projectCount: projectsInMonth.get(b.month)?.size ?? 0,
      };
    })
    .sort((a, b) => compareMonth(a.month, b.month));
}

/** 月次 P/L を期間合計にまとめる */
export function sumMonthlyPL(months: MonthlyPL[]): PLTotals {
  const total: PLTotals = {
    gmv: 0,
    companyRevenue: 0,
    rewardDirect: 0,
    rewardIndirect: 0,
    rewardTotal: 0,
    grossProfit: 0,
    grossMargin: null,
    projectCount: 0,
  };
  for (const m of months) {
    total.gmv += m.gmv;
    total.companyRevenue += m.companyRevenue;
    total.rewardDirect += m.rewardDirect;
    total.rewardIndirect += m.rewardIndirect;
    total.rewardTotal += m.rewardTotal;
    total.grossProfit += m.grossProfit;
    total.projectCount += m.projectCount;
  }
  total.grossMargin = calcMargin(total.grossProfit, total.companyRevenue);
  return total;
}

/** 事業の月次 P/L を DB から計算する。自社取り分が未設定の事業は null を返す */
export async function calculateBusinessMonthlyPL(
  prisma: PrismaClient,
  businessId: number,
  fromMonth: string,
  toMonth: string,
): Promise<MonthlyPL[] | null> {
  const ctx = await loadBusinessRewardContext(prisma, businessId, { includeUnconfirmed: true });
  if (!ctx) return null;
  if (!isCompanyShareConfigured(ctx.config.companyShare)) return null;
  const basis = prepareContext(ctx);
  return computeMonthlyPL(ctx, basis, fromMonth, toMonth);
}
