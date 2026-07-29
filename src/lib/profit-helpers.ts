import type { PrismaClient } from '@prisma/client';
import {
  getRevenueAmount,
  getRevenueMonth,
  getPrimaryKpiDefinition,
  injectFormulaValues,
} from '@/lib/revenue-helpers';
import {
  applyRewardSetting,
  computeChainRewardAmounts,
  computeProjectEntries,
  getRewardConfig,
  getStockActiveMonths,
  loadBusinessRewardContext,
  resolveCompanyShareBaseField,
  resolvePartnerChain,
  toProjectRewardInput,
  compareMonth,
  type BusinessRewardContext,
  type ConfirmedProjectRow,
  type ProjectRewardInput,
  type RewardChainNode,
  type RewardConfig,
} from '@/lib/reward-helpers';
import { formatRewardSetting } from '@/lib/reward-slots';
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
//   代理店支払手数料     担当代理店＋上位代理店。税抜（消費税は預り金なので粗利から引かない）
//   粗利           自社売上 − 代理店支払手数料。粗利率 = 粗利 ÷ 自社売上
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
// ただし対象ステータスだけは、事業マスタの「収益の計上対象ステータス」で
// 収益セクション専用に絞り込める（rewardConfig.companyShare.statusFilter）。
// 売上カードは見込み全体を広く見たいが、自社売上・粗利は確度の高い案件だけで
// 見たい、という運用のために用意した上書き。未設定ならKPIの母集団と一致したまま。
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
 *
 * ステータスだけは例外で、事業マスタの「収益の計上対象ステータス」
 * （rewardConfig.companyShare.statusFilter）が設定されていればそちらを優先する。
 * 売上KPIカードは見込み全体を広く見たい／自社売上・粗利は確度の高い案件だけで
 * 見たい、という運用上のズレを、KPI定義を変えずに吸収するため。
 */
export function resolveProfitBasis(businessConfig: unknown): ProfitBasis | null {
  const kpi = getPrimaryKpiDefinition(businessConfig);
  if (!kpi) return null;

  const kpiStatusCodes = kpi.statusFilter
    ? Array.isArray(kpi.statusFilter)
      ? kpi.statusFilter
      : [kpi.statusFilter]
    : null;

  // 収益専用の対象ステータス（未設定・空配列ならKPIの statusFilter に従う）
  const override = getRewardConfig(businessConfig)?.companyShare.statusFilter;
  const statusCodes = override && override.length > 0 ? override : kpiStatusCodes;

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
 * ストック展開（getStockActiveMonths）と支払明細計算（computeProjectEntries）は
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
  /** 担当代理店＋上位代理店の合計。「いくら支払うか」だけ見たいとき用 */
  rewardShotTotal: number | null;
  companyRevenueShot: number | null;
  grossProfitShot: number | null;
  grossMarginShot: number | null; // %

  // --- ストック（契約継続中は毎月。1ヶ月あたりの金額）---
  rewardStockDirect: number | null;
  rewardStockIndirect: number | null;
  rewardStockTotal: number | null;
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
  rewardShotTotal: null,
  companyRevenueShot: null,
  grossProfitShot: null,
  grossMarginShot: null,
  rewardStockDirect: null,
  rewardStockIndirect: null,
  rewardStockTotal: null,
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

/**
 * 粗利率（%）。自社売上が 0 または未設定なら null（0除算・無意味な100%を避ける）。
 *
 * 呼び出し側でロールアップ（代理店別など）を作るときも必ずこれを使う。
 * 丸め方が1箇所ずれるだけで「合計は合うのに率だけ合わない」表が出来上がるため。
 */
export function calcMarginPercent(grossProfit: number | null, companyRevenue: number | null): number | null {
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
  chain: RewardChainNode[],
  config: RewardConfig,
  basis: ProfitBasis | null,
  recognized: boolean,
): ProjectFinancials {
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

  // 取り分・報酬とも同じ「取扱高」に対して掛けるので、基準フィールドは共通にする。
  // 順序は 取り分の明示指定 → 報酬の基準 → KPIのsourceField。
  //
  // KPIのsourceField を先に見てはいけない。プライマリKPIが「受注見込み数」の
  // ような数量フィールドだと、取り分だけが台数(例:3)を基準に計算されて
  // 3 × 20% = 0（切り捨て）になり、報酬（金額基準）と桁がまるで合わなくなる。
  const shotShareBase = amountOf(resolveCompanyShareBaseField(config, 'shot') ?? basis?.sourceField ?? null);
  const stockShareBase = amountOf(resolveCompanyShareBaseField(config, 'stock'));
  const shotRewardBase = amountOf(config.shotBaseField ?? basis?.sourceField ?? null);
  const stockRewardBase = amountOf(config.stockBaseField);

  // 手数料は階層を最上位まで遡って積み上げる（担当店ぶん / 上位店ぶんの合計）
  const emptyAmounts = { direct: null, indirect: null };
  const shotAmounts = countable
    ? computeChainRewardAmounts('shot', chain, config, project, shotRewardBase)
    : emptyAmounts;
  const stockAmounts = countable
    ? computeChainRewardAmounts('stock', chain, config, project, stockRewardBase)
    : emptyAmounts;

  const rewardShotDirect = shotAmounts.direct;
  const rewardShotIndirect = shotAmounts.indirect;
  const rewardStockDirect = stockAmounts.direct;
  const rewardStockIndirect = stockAmounts.indirect;

  const companyRevenueShot = countable && share.shot ? applyRewardSetting(share.shot, shotShareBase) : null;
  const companyRevenueStock = countable && share.stock ? applyRewardSetting(share.stock, stockShareBase) : null;

  // 「いくら支払うか」の合計。どちらのスロットも未設定なら null（¥0 と区別する）
  const totalOf = (a: number | null, b: number | null): number | null =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  const rewardShotTotal = totalOf(rewardShotDirect, rewardShotIndirect);
  const rewardStockTotal = totalOf(rewardStockDirect, rewardStockIndirect);

  const grossProfitShot =
    companyRevenueShot === null ? null : companyRevenueShot - (rewardShotTotal ?? 0);
  const grossProfitStock =
    companyRevenueStock === null ? null : companyRevenueStock - (rewardStockTotal ?? 0);

  return {
    companyShareShotLabel: share.shot ? formatRewardSetting(share.shot) : null,
    companyShareStockLabel: share.stock ? formatRewardSetting(share.stock) : null,
    companyShareIsOverridden: isOverridden,
    rewardShotDirect,
    rewardShotIndirect,
    rewardShotTotal,
    companyRevenueShot,
    grossProfitShot,
    grossMarginShot: calcMarginPercent(grossProfitShot, companyRevenueShot),
    rewardStockDirect,
    rewardStockIndirect,
    rewardStockTotal,
    companyRevenueStock,
    grossProfitStock,
    grossMarginStock: calcMarginPercent(grossProfitStock, companyRevenueStock),
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
    const chain = resolvePartnerChain(row.partnerId, ctx.linkByPartner);
    result.set(
      row.id,
      computeProjectFinancials(
        input,
        chain,
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
  const chain = resolvePartnerChain(row.partnerId, ctx.linkByPartner);
  return computeProjectFinancials(
    input,
        chain,
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
  grossMargin: number | null; // % 自社売上比
  grossMarginOnGmv: number | null; // % 取扱高（GMV）比。自社取り分を考慮しない参考値
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
    grossMarginOnGmv: null,
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

  for (const row of ctx.projects) {
    for (const d of projectMonthDeltas(ctx, basis, row, fromMonth, toMonth)) {
      const b = bucketFor(d.month);
      b.gmv += d.gmv;
      b.companyRevenue += d.companyRevenue;
      b.rewardDirect += d.rewardDirect;
      b.rewardIndirect += d.rewardIndirect;

      let s = projectsInMonth.get(d.month);
      if (!s) {
        s = new Set<number>();
        projectsInMonth.set(d.month, s);
      }
      s.add(row.id);
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
        grossMargin: calcMarginPercent(grossProfit, b.companyRevenue),
        grossMarginOnGmv: calcMarginPercent(grossProfit, b.gmv),
        projectCount: projectsInMonth.get(b.month)?.size ?? 0,
      };
    })
    .sort((a, b) => compareMonth(a.month, b.month));
}

/** 1案件が特定の月にもたらす増分 */
interface MonthDelta {
  month: string;
  gmv: number;
  companyRevenue: number;
  rewardDirect: number;
  rewardIndirect: number;
}

/**
 * 1案件ぶんの月別増分を返す（計上対象外なら空配列）。
 * 月次集計と案件別内訳の両方がこれを使うので、二重実装で数字がズレることがない。
 */
function projectMonthDeltas(
  ctx: BusinessRewardContext,
  basis: ProfitBasis,
  row: ConfirmedProjectRow,
  fromMonth: string,
  toMonth: string,
): MonthDelta[] {
  if (!isRecognized(row, basis)) return [];

  const base = toProjectRewardInput(row);
  const month = recognitionMonthOf(base, basis);
  if (!month) return [];

  const project = withRecognitionMonth(base, month);
  const chain = resolvePartnerChain(row.partnerId, ctx.linkByPartner);
  const { share } = resolveProjectCompanyShare(ctx.config, project);

  const revenueSource = {
    id: project.id,
    projectExpectedCloseMonth: project.projectExpectedCloseMonth,
    projectCustomData: project.projectCustomData,
  };
  const amountOf = (field: string | null) => (field ? getRevenueAmount(revenueSource, field) : 0);

  const byMonth = new Map<string, MonthDelta>();
  const deltaFor = (m: string): MonthDelta => {
    let d = byMonth.get(m);
    if (!d) {
      d = { month: m, gmv: 0, companyRevenue: 0, rewardDirect: 0, rewardIndirect: 0 };
      byMonth.set(m, d);
    }
    return d;
  };

  // --- 売上側: ショット（計上月に1回）---
  if (compareMonth(month, fromMonth) >= 0 && compareMonth(month, toMonth) <= 0) {
    const d = deltaFor(month);
    // 取扱高は報酬の基準金額と同じフィールドから取る。KPIのsourceField を
    // 優先すると、プライマリKPIが数量（受注見込み数など）の事業で取扱高が
    // 台数になってしまい、報酬と桁が合わなくなる
    d.gmv += amountOf(ctx.config.shotBaseField ?? basis.sourceField);
    if (share.shot) {
      d.companyRevenue += applyRewardSetting(
        share.shot,
        amountOf(resolveCompanyShareBaseField(ctx.config, 'shot') ?? basis.sourceField),
      );
    }
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
        const d = deltaFor(m);
        d.gmv += stockGmv;
        d.companyRevenue += stockRevenue;
      }
    }
  }

  // --- 手数料側: 計上月で集計 ---
  for (const e of computeProjectEntries(project, chain, ctx.config, fromMonth, toMonth)) {
    const d = deltaFor(e.sourceMonth);
    if (e.entryType === 'direct') d.rewardDirect += e.rewardAmount;
    else d.rewardIndirect += e.rewardAmount;
  }

  return Array.from(byMonth.values());
}

// ============================================
// 案件別の内訳（数字が合わないときの突き合わせ用）
// ============================================

/** 期間内の1案件ぶんの収益。「どの案件で手数料が発生していないか」を特定できる */
export interface ProjectPLRow {
  projectId: number;
  projectNo: string;
  customerName: string | null;
  /** 代理店名。null は代理店が紐づいていない案件（＝手数料が発生しない） */
  partnerName: string | null;
  gmv: number;
  companyRevenue: number;
  rewardTotal: number;
  grossProfit: number;
  grossMargin: number | null; // % 自社売上比
  grossMarginOnGmv: number | null; // % 取扱高（GMV）比
}

/** 期間内に計上のあった案件を、金額の大きい順に返す */
export function computeProjectPLRows(
  ctx: BusinessRewardContext,
  basis: ProfitBasis | null,
  fromMonth: string,
  toMonth: string,
): ProjectPLRow[] {
  if (!basis) return [];

  const rows: ProjectPLRow[] = [];
  for (const row of ctx.projects) {
    const deltas = projectMonthDeltas(ctx, basis, row, fromMonth, toMonth);
    if (deltas.length === 0) continue;

    let gmv = 0;
    let companyRevenue = 0;
    let rewardTotal = 0;
    for (const d of deltas) {
      gmv += d.gmv;
      companyRevenue += d.companyRevenue;
      rewardTotal += d.rewardDirect + d.rewardIndirect;
    }
    const grossProfit = companyRevenue - rewardTotal;

    rows.push({
      projectId: row.id,
      projectNo: row.projectNo,
      customerName: row.customer?.customerName ?? null,
      partnerName: row.partner?.partnerName ?? null,
      gmv,
      companyRevenue,
      rewardTotal,
      grossProfit,
      grossMargin: calcMarginPercent(grossProfit, companyRevenue),
      grossMarginOnGmv: calcMarginPercent(grossProfit, gmv),
    });
  }

  return rows.sort((a, b) => b.gmv - a.gmv);
}

/** 事業の案件別内訳を DB から計算する。自社取り分が未設定の事業は null を返す */
export async function calculateBusinessProjectPL(
  prisma: PrismaClient,
  businessId: number,
  fromMonth: string,
  toMonth: string,
): Promise<ProjectPLRow[] | null> {
  const ctx = await loadBusinessRewardContext(prisma, businessId, { includeUnconfirmed: true });
  if (!ctx) return null;
  if (!isCompanyShareConfigured(ctx.config.companyShare)) return null;
  const basis = prepareContext(ctx);
  return computeProjectPLRows(ctx, basis, fromMonth, toMonth);
}

// ============================================
// 案件 × 計上月の内訳（外部集計API用）
// ============================================

/**
 * 期間内の「案件 1 件 × 計上月 1 ヶ月」ぶんの収益。
 *
 * ProjectPLRow（画面の突き合わせ用）との違い:
 *   - 月を持つ（ストック展開で1案件が複数月にまたがる場合は複数行になる）
 *   - 顧客名ではなく customerId を持つ（会社名を出せない外部向けAPIで匿名IDにする）
 *   - 営業ステータス・代理店IDを持つ（確度の判定と代理店別ロールアップ用）
 * 金額は月次P/L・案件別内訳と同じ projectMonthDeltas から作るので、
 * どの切り口で集計しても合計が一致する。
 */
export interface ProjectMonthPL {
  projectId: number;
  projectNo: string;
  customerId: number;
  partnerId: number | null;
  partnerName: string | null;
  salesStatus: string;
  month: string;
  /**
   * KPIの計上月（＝ショットを立てた月）か。
   * 台数のような「1案件につき1回」の指標を、ストック展開した各月に
   * 重複計上しないための目印。
   */
  isRecognitionMonth: boolean;
  gmv: number;
  companyRevenue: number;
  rewardDirect: number;
  rewardIndirect: number;
  rewardTotal: number;
  grossProfit: number;
  grossMargin: number | null; // % 自社売上比
  grossMarginOnGmv: number | null; // % 取扱高比
}

/** 期間内に計上のあった「案件 × 月」を、取扱高の大きい順に返す */
export function computeProjectMonthPLRows(
  ctx: BusinessRewardContext,
  basis: ProfitBasis | null,
  fromMonth: string,
  toMonth: string,
): ProjectMonthPL[] {
  if (!basis) return [];

  const rows: ProjectMonthPL[] = [];
  for (const row of ctx.projects) {
    const deltas = projectMonthDeltas(ctx, basis, row, fromMonth, toMonth);
    if (deltas.length === 0) continue;

    const recognitionMonth = recognitionMonthOf(toProjectRewardInput(row), basis);
    for (const d of deltas) {
      const rewardTotal = d.rewardDirect + d.rewardIndirect;
      const grossProfit = d.companyRevenue - rewardTotal;
      rows.push({
        projectId: row.id,
        projectNo: row.projectNo,
        customerId: row.customerId,
        partnerId: row.partnerId,
        partnerName: row.partner?.partnerName ?? null,
        salesStatus: row.projectSalesStatus,
        month: d.month,
        isRecognitionMonth: d.month === recognitionMonth,
        gmv: d.gmv,
        companyRevenue: d.companyRevenue,
        rewardDirect: d.rewardDirect,
        rewardIndirect: d.rewardIndirect,
        rewardTotal,
        grossProfit,
        grossMargin: calcMarginPercent(grossProfit, d.companyRevenue),
        grossMarginOnGmv: calcMarginPercent(grossProfit, d.gmv),
      });
    }
  }

  return rows.sort((a, b) => (b.gmv !== a.gmv ? b.gmv - a.gmv : compareMonth(a.month, b.month)));
}

/**
 * 事業の「案件 × 計上月」内訳を DB から計算する。
 * 自社取り分が未設定の事業は null を返す（0 埋めしない）。
 */
export async function calculateBusinessProjectMonthPL(
  prisma: PrismaClient,
  businessId: number,
  fromMonth: string,
  toMonth: string,
): Promise<ProjectMonthPL[] | null> {
  const ctx = await loadBusinessRewardContext(prisma, businessId, { includeUnconfirmed: true });
  if (!ctx) return null;
  if (!isCompanyShareConfigured(ctx.config.companyShare)) return null;
  const basis = prepareContext(ctx);
  return computeProjectMonthPLRows(ctx, basis, fromMonth, toMonth);
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
    grossMarginOnGmv: null,
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
  total.grossMargin = calcMarginPercent(total.grossProfit, total.companyRevenue);
  total.grossMarginOnGmv = calcMarginPercent(total.grossProfit, total.gmv);
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
