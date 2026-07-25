import type { PrismaClient } from '@prisma/client';
import { getRevenueAmount } from '@/lib/revenue-helpers';
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

// ============================================
// 収益（自社売上・粗利）計算
// ============================================
//
// 用語:
//   取扱高(GMV)   顧客が支払う総額。報酬計算の基準額と同じフィールドから取る
//   自社売上       取扱高 × 自社取り分（事業デフォルト→案件別上書きで解決）
//   代理店報酬     直紹介＋間接。税抜（消費税は預り金なので粗利から引かない）
//   粗利           自社売上 − 代理店報酬。粗利率 = 粗利 ÷ 自社売上
//
// 「経常利益」は販管費・営業外まで含む全社の数字で、事業別・案件別には配賦なしに
// 出せない。ここで扱うのは粗利（売上総利益）までとする。
//
// 集計軸は発生月(sourceMonth)。支払月(paymentMonth)は資金繰り用で、P/L では使わない。

// ============================================
// 案件1件ぶんの収益（一覧列表示用）
// ============================================

/** 案件1件の報酬・自社売上・粗利。null は「未設定 or 対象外」 */
export interface ProjectFinancials {
  // --- 適用中の自社取り分（収益未確定の案件でも設定は表示できる）---
  companyShareShotLabel: string | null; // "20%" / "¥5,000"
  companyShareStockLabel: string | null;
  companyShareIsOverridden: boolean; // 案件別上書きが効いているか

  // --- ショット（収益確定時に1回）---
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

/**
 * 報酬設定が無い事業・計算対象外の案件で使う空の収益。
 * 一覧 GET と PATCH レスポンスでキー集合を必ず揃えるために共有する
 * （PATCH で欠けると行全体置換で一覧の該当列が消えるため）。
 */
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
  canSeeCompanyRevenue: boolean,
): ProjectFinancials {
  if (canSeeCompanyRevenue) return financials;
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
 * 金額は収益確定（revenueConfirmedMonth）済みの案件でのみ算出する。未確定案件は
 * 金額をすべて null にし、設定ラベルだけ返す（一覧で取り分だけ確認できるように）。
 */
export function computeProjectFinancials(
  project: ProjectRewardInput,
  responsibleLink: LinkRewardInput | null,
  parentLink: LinkRewardInput | null,
  config: RewardConfig,
): ProjectFinancials {
  const settings = resolveProjectRewardSettings(config, responsibleLink, parentLink, project);
  const { share, isOverridden } = resolveProjectCompanyShare(config, project);

  const revenueSource = {
    id: project.id,
    projectExpectedCloseMonth: project.projectExpectedCloseMonth,
    projectCustomData: project.projectCustomData,
  };
  const amountOf = (field: string | null) => (field ? getRevenueAmount(revenueSource, field) : 0);

  const isConfirmed = project.revenueConfirmedMonth != null;
  const hasResponsible = project.partnerId != null;
  const hasParent = parentLink != null;

  const shotBase = amountOf(config.shotBaseField);
  const stockBase = amountOf(config.stockBaseField);
  const companyShotBase = amountOf(resolveCompanyShareBaseField(config, 'shot'));
  const companyStockBase = amountOf(resolveCompanyShareBaseField(config, 'stock'));

  const rewardOf = (
    setting: RewardSetting | undefined,
    hasPartner: boolean,
    base: number,
  ): number | null => (isConfirmed && hasPartner && setting ? applyRewardSetting(setting, base) : null);

  const revenueOf = (setting: RewardSetting | undefined, base: number): number | null =>
    isConfirmed && setting ? applyRewardSetting(setting, base) : null;

  const rewardShotDirect = rewardOf(settings.shotDirect, hasResponsible, shotBase);
  const rewardShotIndirect = rewardOf(settings.shotIndirect, hasParent, shotBase);
  const rewardStockDirect = rewardOf(settings.stockDirect, hasResponsible, stockBase);
  const rewardStockIndirect = rewardOf(settings.stockIndirect, hasParent, stockBase);

  const companyRevenueShot = revenueOf(share.shot, companyShotBase);
  const companyRevenueStock = revenueOf(share.stock, companyStockBase);

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

/**
 * 案件一覧の列表示用: 事業内の案件それぞれの報酬・自社売上・粗利を計算する。
 *
 * 収益未確定の案件も含めて返す（金額は null、取り分ラベルのみ）。
 * 一覧のページング単位（最大100件程度）で呼ばれる想定。
 */
export async function calculateProjectFinancialsByBusiness(
  prisma: PrismaClient,
  businessId: number,
): Promise<Map<number, ProjectFinancials>> {
  const result = new Map<number, ProjectFinancials>();
  const ctx = await loadBusinessRewardContext(prisma, businessId, { includeUnconfirmed: true });
  if (!ctx) return result;

  for (const p of ctx.projects) {
    const input = toProjectRewardInput(p);
    const { responsibleLink, parentLink } = resolveResponsibleAndParentLinks(p.partnerId, ctx.linkByPartner);
    result.set(p.id, computeProjectFinancials(input, responsibleLink, parentLink, ctx.config));
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

  const input = toProjectRewardInput(row);
  const { responsibleLink, parentLink } = resolveResponsibleAndParentLinks(row.partnerId, ctx.linkByPartner);
  return computeProjectFinancials(input, responsibleLink, parentLink, ctx.config);
}

// ============================================
// 月次 P/L（ダッシュボード用）
// ============================================

/** 1ヶ月ぶんの収益サマリー。全て発生月ベース */
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
 * 事業の月次 P/L を発生月ベースで計算する（純粋関数）。
 *
 * ショットは収益確定月に1回、ストックは契約継続中の各月に計上する。
 * ストックを毎月立てないと「報酬だけ毎月出て売上は初月だけ」となり、
 * 2ヶ月目以降の粗利が必ずマイナスになるため、売上側も報酬と同じ
 * getStockActiveMonths で月を展開する。
 */
export function computeMonthlyPL(
  ctx: BusinessRewardContext,
  fromMonth: string,
  toMonth: string,
): MonthlyPL[] {
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
    const project = toProjectRewardInput(row);
    if (!project.revenueConfirmedMonth) continue;

    const { responsibleLink, parentLink } = resolveResponsibleAndParentLinks(row.partnerId, ctx.linkByPartner);
    const { share } = resolveProjectCompanyShare(ctx.config, project);

    const revenueSource = {
      id: project.id,
      projectExpectedCloseMonth: project.projectExpectedCloseMonth,
      projectCustomData: project.projectCustomData,
    };
    const amountOf = (field: string | null) => (field ? getRevenueAmount(revenueSource, field) : 0);

    // --- 売上側: ショット（確定月に1回）---
    const confirmedMonth = project.revenueConfirmedMonth;
    if (compareMonth(confirmedMonth, fromMonth) >= 0 && compareMonth(confirmedMonth, toMonth) <= 0) {
      const b = bucketFor(confirmedMonth);
      b.gmv += amountOf(ctx.config.shotBaseField);
      if (share.shot) {
        b.companyRevenue += applyRewardSetting(share.shot, amountOf(resolveCompanyShareBaseField(ctx.config, 'shot')));
      }
      markProject(confirmedMonth, project.id);
    }

    // --- 売上側: ストック（継続中の各月）---
    const stockMonths = getStockActiveMonths(project, fromMonth, toMonth);
    if (stockMonths.length > 0) {
      const stockGmv = amountOf(ctx.config.stockBaseField);
      const stockRevenue = share.stock
        ? applyRewardSetting(share.stock, amountOf(resolveCompanyShareBaseField(ctx.config, 'stock')))
        : 0;
      // ストック設定も取り分も無い案件は月を立てない（空の月が並ぶのを防ぐ）
      if (stockGmv > 0 || stockRevenue > 0) {
        for (const month of stockMonths) {
          const b = bucketFor(month);
          b.gmv += stockGmv;
          b.companyRevenue += stockRevenue;
          markProject(month, project.id);
        }
      }
    }

    // --- 報酬側: 発生月で集計 ---
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
  const ctx = await loadBusinessRewardContext(prisma, businessId);
  if (!ctx) return null;
  if (!isCompanyShareConfigured(ctx.config.companyShare)) return null;
  return computeMonthlyPL(ctx, fromMonth, toMonth);
}
