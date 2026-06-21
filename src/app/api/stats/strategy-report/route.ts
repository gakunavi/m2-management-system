import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getPrimaryKpiDefinition,
  getKpiDefinitions,
  getActiveFieldKeys,
  getRevenueAmount,
  getRevenueMonth,
  injectFormulaValues,
} from '@/lib/revenue-helpers';
import type { ProjectFieldDefinition } from '@/types/dynamic-fields';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/stats/strategy-report?months=6
//
// 経営戦略室の AI（Claude Cowork）向け read-only 集計 API。
// - 認証: Authorization: Bearer <STATS_API_TOKEN>
//   - トークン未設定: エンドポイント自体を無効化（404）
//   - トークン不一致／未指定: 401
// - 対象事業: env STATS_BUSINESS_CODE（安定キー businessCode で解決）
// - 読み取り専用。DB への書き込み・スキーマ変更は一切行わない。
// - 顧客の個人情報・会社名は返さない（customer_ref は匿名 ID のみ）。
// ============================================================================

const DEFAULT_MONTHS = 6;
const MAX_MONTHS = 24;

/** "YYYY-MM" を返す */
function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** from（含む）〜 to（含む）の YYYY-MM 配列を生成 */
function monthRange(fromYm: string, toYm: string): string[] {
  const result: string[] = [];
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}

/** ISO 8601（JST, +09:00）形式のタイムスタンプ */
function nowIsoJst(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const base = jst.toISOString().replace('Z', '');
  return `${base.substring(0, 19)}+09:00`;
}

type ProjectRow = {
  id: number;
  customerId: number;
  partnerId: number | null;
  projectSalesStatus: string;
  projectExpectedCloseMonth: string | null;
  projectCustomData: unknown;
  createdAt: Date;
  projectStatusChangedAt: Date | null;
  projectIsActive: boolean;
  partner: { partnerName: string } | null;
};

export async function GET(request: NextRequest) {
  const now = new Date();

  // --- 認証 ---------------------------------------------------------------
  const statsToken = process.env.STATS_API_TOKEN;
  // トークン未設定 → エンドポイント無効化（404）
  if (!statsToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${statsToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- パラメータ ---------------------------------------------------------
  const monthsParam = request.nextUrl.searchParams.get('months');
  let months = monthsParam ? parseInt(monthsParam, 10) : DEFAULT_MONTHS;
  if (!Number.isFinite(months) || months < 1) months = DEFAULT_MONTHS;
  if (months > MAX_MONTHS) months = MAX_MONTHS;

  // 期間: 当月を含み、過去 months ヶ月分のバケットを対象とする
  // from = 当月の months ヶ月前の月初, to = 現在時刻
  const fromDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const fromYm = toYearMonth(fromDate);
  const currentYm = toYearMonth(now);
  const months_list = monthRange(fromYm, currentYm);
  const fromStr = `${fromYm}-01`;
  const toStr = now.toISOString().substring(0, 10);

  const notes: string[] = [];

  // --- 対象事業の解決 -----------------------------------------------------
  const businessCode = process.env.STATS_BUSINESS_CODE;
  if (!businessCode) {
    notes.push(
      'STATS_BUSINESS_CODE が未設定のため集計対象事業を特定できません。env に対象事業の businessCode（例: LIGHT）を設定してください。',
    );
    return NextResponse.json(buildEmptyResponse(now, fromStr, toStr, months_list, notes));
  }

  // businessCode は大文字小文字を区別しない（既存事業コードは小文字運用: moag 等。
  // env の表記揺れ LIGHT/light/Light による静かな空データを防ぐ）。
  const business = await prisma.business.findFirst({
    where: { businessCode: { equals: businessCode, mode: 'insensitive' } },
    select: { id: true, businessCode: true, businessName: true, businessConfig: true },
  });
  if (!business) {
    notes.push(`businessCode="${businessCode}" に一致する事業が見つかりません（大文字小文字は区別しません）。`);
    return NextResponse.json(buildEmptyResponse(now, fromStr, toStr, months_list, notes));
  }

  // --- ステータス定義（成約／失注の判定） --------------------------------
  const statusDefs = await prisma.businessStatusDefinition.findMany({
    where: { businessId: business.id, statusIsActive: true },
    orderBy: { statusSortOrder: 'asc' },
  });
  const statusLabelMap = new Map<string, string>();
  const wonCodes = new Set<string>();
  const lostCodes = new Set<string>();
  for (const sd of statusDefs) {
    if (!statusLabelMap.has(sd.statusCode)) statusLabelMap.set(sd.statusCode, sd.statusLabel);
    // 成約 = 最終ステータス かつ 失注でない / 失注 = statusIsLost
    if (sd.statusIsLost) lostCodes.add(sd.statusCode);
    else if (sd.statusIsFinal) wonCodes.add(sd.statusCode);
  }
  if (wonCodes.size === 0) {
    notes.push(
      '成約ステータス（status_is_final=true かつ status_is_lost=false）が定義されていないため、成約系の集計は空になります。',
    );
  }

  // --- KPI（金額フィールド・台数フィールド・計上日フィールド）の解決 ----
  const businessConfig = business.businessConfig;
  const config = businessConfig as { projectFields?: ProjectFieldDefinition[] } | null;
  const projectFields = config?.projectFields ?? [];
  const activeFieldKeys = getActiveFieldKeys(businessConfig);

  const primaryKpi = getPrimaryKpiDefinition(businessConfig);
  // 金額フィールド: プライマリ KPI の sourceField（aggregation=count の場合は金額なし）
  const amountField =
    primaryKpi && primaryKpi.aggregation !== 'count' && primaryKpi.sourceField
      ? primaryKpi.sourceField
      : null;
  if (!amountField) {
    notes.push(
      '金額フィールドが businessConfig の KPI（sourceField）から解決できないため、amount 系は 0/null になります。',
    );
  } else if (!activeFieldKeys.has(amountField)) {
    notes.push(`金額フィールド "${amountField}" が現在のフィールド定義に存在しないため、amount 系は 0 になります。`);
  }

  // 計上日フィールド: KPI の dateField（なければ projectExpectedCloseMonth）
  const dateField = primaryKpi?.dateField ?? 'projectExpectedCloseMonth';

  // 台数フィールド: key="units" の KPI の sourceField（なければ "unit_count"）
  const allKpis = getKpiDefinitions(businessConfig);
  const unitsKpi = allKpis.find((k) => k.key === 'units');
  const unitsFieldCandidate = unitsKpi?.sourceField ?? 'unit_count';
  const unitsField = activeFieldKeys.has(unitsFieldCandidate) ? unitsFieldCandidate : null;
  if (!unitsField) {
    notes.push(
      `台数フィールド（${unitsFieldCandidate}）が見つからないため、closed_deals[].units は null になります。`,
    );
  }

  // lead_time: 専用の成約日カラムが存在しないため算出しない（null）
  notes.push(
    'lead_time は算出していません（専用の成約日カラムが存在しないため）。lead_time.* と closed_deals[].lead_time_days は null を返します。',
  );

  // --- 案件取得（1 クエリ） ----------------------------------------------
  const projects: ProjectRow[] = await prisma.project.findMany({
    where: { businessId: business.id },
    select: {
      id: true,
      customerId: true,
      partnerId: true,
      projectSalesStatus: true,
      projectExpectedCloseMonth: true,
      projectCustomData: true,
      createdAt: true,
      projectStatusChangedAt: true,
      projectIsActive: true,
      partner: { select: { partnerName: true } },
    },
  });

  // formula フィールドの再計算（金額が formula のケースに対応）
  if (projectFields.some((f) => f.type === 'formula')) {
    injectFormulaValues(projects, projectFields);
  }

  const agentName = (p: ProjectRow): string => p.partner?.partnerName ?? '直販';
  const amountOf = (p: ProjectRow): number =>
    amountField && activeFieldKeys.has(amountField)
      ? getRevenueAmount({ id: p.id, projectExpectedCloseMonth: null, projectCustomData: p.projectCustomData }, amountField)
      : 0;
  const unitsOf = (p: ProjectRow): number | null => {
    if (!unitsField) return null;
    const data = p.projectCustomData as Record<string, unknown> | null;
    const v = data?.[unitsField];
    return typeof v === 'number' ? v : null;
  };
  const closeMonthOf = (p: ProjectRow): string | null =>
    getRevenueMonth({ id: p.id, projectExpectedCloseMonth: p.projectExpectedCloseMonth, projectCustomData: p.projectCustomData }, dateField);

  // --- 代理店の系統（階層）情報のロード ----------------------------------
  // 系統 = 紹介ルート。専用カラムは無く、親子チェーンを根まで遡った最上位
  // （1次代理店）の代理店名を「系統名（lineage）」とする派生値。
  // 事業別階層（PartnerBusinessLink）を主、グローバル階層（Partner）を
  // フォールバックとして解決する（本 API は単一事業スコープのため）。
  const bizLinks = await prisma.partnerBusinessLink.findMany({
    where: { businessId: business.id },
    select: { partnerId: true, businessTier: true, businessParentId: true },
  });
  const bizLinkMap = new Map<number, { tier: string | null; parentId: number | null }>();
  for (const bl of bizLinks) {
    bizLinkMap.set(bl.partnerId, { tier: bl.businessTier, parentId: bl.businessParentId });
  }
  // 代理店名・グローバル階層の解決用（祖先名は本体 Partner にしか無いため全件ロード）。
  const allPartners = await prisma.partner.findMany({
    select: { id: true, partnerName: true, partnerTier: true, parentId: true },
  });
  const partnerMap = new Map<number, { name: string; tier: string | null; parentId: number | null }>();
  for (const pt of allPartners) {
    partnerMap.set(pt.id, { name: pt.partnerName, tier: pt.partnerTier, parentId: pt.parentId });
  }

  // 事業別優先・グローバルフォールバックで階層（tier/親）を解決する。
  // 事業リンクが存在する代理店は、その事業内の階層を全面採用（親が null なら
  // この事業での 1次代理店扱い）。リンクが無い代理店のみグローバルへフォールバック。
  const resolveHierarchy = (partnerId: number): { tier: string | null; parentId: number | null } => {
    const bl = bizLinkMap.get(partnerId);
    if (bl) return { tier: bl.tier, parentId: bl.parentId };
    const pt = partnerMap.get(partnerId);
    if (pt) return { tier: pt.tier, parentId: pt.parentId };
    return { tier: null, parentId: null };
  };
  const partnerNameOf = (partnerId: number): string | null => partnerMap.get(partnerId)?.name ?? null;

  // 紹介ルートの根（最上位代理店）まで遡って partnerId を返す（循環/異常は深さ 10 で打ち切り）。
  const resolveLineageRootId = (partnerId: number): number => {
    let currentId = partnerId;
    for (let depth = 0; depth < 10; depth++) {
      const { parentId } = resolveHierarchy(currentId);
      if (parentId == null || parentId === currentId) break;
      if (!partnerMap.has(parentId) && !bizLinkMap.has(parentId)) break;
      currentId = parentId;
    }
    return currentId;
  };

  type AgentMeta = {
    lineage: string;
    tier: string | null;
    referrer: string | null;
    referrer_partner_id: number | null;
  };
  // 代理店ID → 系統メタ。直販(null)は独立系統、tier/親いずれも無い代理店は「未分類」。
  const agentMetaOf = (partnerId: number | null): AgentMeta => {
    if (partnerId == null) {
      return { lineage: '直販', tier: null, referrer: null, referrer_partner_id: null };
    }
    const { tier, parentId } = resolveHierarchy(partnerId);
    // 系統情報が一切無い（階層・親ともに null）代理店 → 欠損を可視化するため未分類
    if (tier == null && parentId == null) {
      return { lineage: '未分類', tier: null, referrer: null, referrer_partner_id: null };
    }
    const rootName = partnerNameOf(resolveLineageRootId(partnerId));
    const referrer = parentId != null ? partnerNameOf(parentId) : null;
    return { lineage: rootName ?? '未分類', tier, referrer, referrer_partner_id: parentId };
  };

  // --- pipeline.by_stage（アクティブ案件のスナップショット） --------------
  const activeProjects = projects.filter((p) => p.projectIsActive);
  const stageAgg = new Map<string, { count: number; amount: number }>();
  for (const p of activeProjects) {
    const entry = stageAgg.get(p.projectSalesStatus) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += amountOf(p);
    stageAgg.set(p.projectSalesStatus, entry);
  }
  // ステータス定義のソート順を維持
  const orderedCodes = statusDefs
    .map((sd) => sd.statusCode)
    .filter((code, i, arr) => arr.indexOf(code) === i);
  const by_stage = Array.from(stageAgg.keys())
    .sort((a, b) => {
      const ia = orderedCodes.indexOf(a);
      const ib = orderedCodes.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })
    .map((code) => ({
      stage: statusLabelMap.get(code) ?? code,
      count: stageAgg.get(code)!.count,
      amount_total: amountField ? stageAgg.get(code)!.amount : null,
    }));

  // --- pipeline.by_agent --------------------------------------------------
  // 代理店ID をキーに集計（同名代理店の衝突回避 + 系統メタの正確な付与）。
  // 出力の agent は従来どおり代理店名（直販は '直販'）で後方互換を維持。
  const agentAgg = new Map<
    string,
    { partnerId: number | null; name: string; active_deals: number; stages: Map<string, number> }
  >();
  for (const p of activeProjects) {
    const key = p.partnerId == null ? '__direct__' : `p${p.partnerId}`;
    const entry =
      agentAgg.get(key) ?? { partnerId: p.partnerId, name: agentName(p), active_deals: 0, stages: new Map<string, number>() };
    entry.active_deals += 1;
    const label = statusLabelMap.get(p.projectSalesStatus) ?? p.projectSalesStatus;
    entry.stages.set(label, (entry.stages.get(label) ?? 0) + 1);
    agentAgg.set(key, entry);
  }
  const by_agent = Array.from(agentAgg.values())
    .sort((a, b) => b.active_deals - a.active_deals)
    .map((v) => {
      const meta = agentMetaOf(v.partnerId);
      return {
        agent: v.name,
        partner_id: v.partnerId,
        lineage: meta.lineage,
        tier: meta.tier,
        referrer: meta.referrer,
        referrer_partner_id: meta.referrer_partner_id,
        active_deals: v.active_deals,
        stages: Object.fromEntries(v.stages),
      };
    });

  // --- closed_deals（成約案件・期間内） -----------------------------------
  const closedInPeriod = projects
    .filter((p) => wonCodes.has(p.projectSalesStatus))
    .map((p) => ({ p, month: closeMonthOf(p) }))
    .filter(({ month }) => month !== null && month >= fromYm && month <= currentYm)
    .sort((a, b) => (a.month! < b.month! ? -1 : 1));
  const closed_deals = closedInPeriod.map(({ p, month }) => {
    const meta = agentMetaOf(p.partnerId);
    return {
      closed_month: month,
      agent: agentName(p),
      lineage: meta.lineage,
      tier: meta.tier,
      units: unitsOf(p),
      amount: amountField ? amountOf(p) : null,
      lead_time_days: null as number | null,
      customer_ref: `cust_${p.customerId}`,
    };
  });

  // --- pipeline.by_lineage（系統ロールアップ） ----------------------------
  // アクティブ案件（active_deals/active_share）＋ 期間内成約（closed_units_period）を
  // 系統単位で集約。系統に現れる代理店はアクティブ・成約いずれかから収集する。
  type LineageAgg = { agentNames: Set<string>; active_deals: number; closed_units: number };
  const lineageAgg = new Map<string, LineageAgg>();
  const ensureLineage = (lineage: string): LineageAgg => {
    let e = lineageAgg.get(lineage);
    if (!e) {
      e = { agentNames: new Set<string>(), active_deals: 0, closed_units: 0 };
      lineageAgg.set(lineage, e);
    }
    return e;
  };
  for (const p of activeProjects) {
    const e = ensureLineage(agentMetaOf(p.partnerId).lineage);
    e.agentNames.add(agentName(p));
    e.active_deals += 1;
  }
  for (const { p } of closedInPeriod) {
    const e = ensureLineage(agentMetaOf(p.partnerId).lineage);
    e.agentNames.add(agentName(p));
    const u = unitsOf(p);
    if (u != null) e.closed_units += u;
  }
  const totalActiveDeals = activeProjects.length; // 全系統 active_deals 合計（各案件は 1 系統に属する）
  const by_lineage = Array.from(lineageAgg.entries())
    .sort((a, b) => b[1].active_deals - a[1].active_deals)
    .map(([lineage, v]) => ({
      lineage,
      partner_count: v.agentNames.size,
      agents: Array.from(v.agentNames).sort(),
      active_deals: v.active_deals,
      closed_units_period: unitsField ? v.closed_units : null,
      active_share: totalActiveDeals > 0 ? Math.round((v.active_deals / totalActiveDeals) * 1000) / 1000 : 0,
    }));
  notes.push(
    'pipeline.by_lineage は代理店の系統（紹介ルートの根＝最上位代理店名）単位のロールアップです。系統名は専用カラムではなく、事業別階層（partner_business_links）を主・グローバル階層（partners）をフォールバックに親子チェーンを根まで遡った最上位代理店名です。partner_count は系統内のユニーク代理店数、active_share は当該系統 active_deals ÷ 全系統 active_deals 合計（小数第3位）。closed_units_period は期間内成約の台数合計（台数フィールド未解決時は null）。直販（代理店なし案件）は系統「直販」、階層情報の無い代理店は「未分類」に集約します。',
  );

  // --- monthly_summary ----------------------------------------------------
  const monthly_summary = months_list.map((month) => {
    let new_deals = 0;
    let closed = 0;
    let lost = 0;
    for (const p of projects) {
      // 新規: createdAt が当月
      if (toYearMonth(p.createdAt) === month) new_deals += 1;
      // 成約: 計上月が当月
      if (wonCodes.has(p.projectSalesStatus) && closeMonthOf(p) === month) closed += 1;
      // 失注: projectStatusChangedAt が当月
      if (
        lostCodes.has(p.projectSalesStatus) &&
        p.projectStatusChangedAt &&
        toYearMonth(p.projectStatusChangedAt) === month
      ) {
        lost += 1;
      }
    }
    const decided = closed + lost;
    const close_rate = decided > 0 ? Math.round((closed / decided) * 1000) / 1000 : 0;
    return { month, new_deals, closed, lost, close_rate };
  });
  notes.push(
    'monthly_summary.close_rate は「成約数 / (成約数 + 失注数)」（当月に決着した案件に占める成約率）で算出しています。新規数を分母にしていません。',
  );
  notes.push(
    'monthly_summary.lost は失注ステータス案件の project_status_changed_at（最終ステータス変更日時）が当月のものを計上しています。',
  );

  // --- lead_time（算出せず null） ----------------------------------------
  const lead_time = { avg_days: null, min_days: null, max_days: null, n: closed_deals.length };

  return NextResponse.json({
    generated_at: nowIsoJst(now),
    business: { code: business.businessCode ?? businessCode, name: business.businessName },
    period: { from: fromStr, to: toStr },
    pipeline: { by_stage, by_agent, by_lineage },
    closed_deals,
    monthly_summary,
    lead_time,
    notes: notes.join(' '),
  });
}

/** 事業未解決時の空レスポンス（構造は維持して AI 側がパースできるようにする） */
function buildEmptyResponse(
  now: Date,
  fromStr: string,
  toStr: string,
  months_list: string[],
  notes: string[],
) {
  return {
    generated_at: nowIsoJst(now),
    business: null,
    period: { from: fromStr, to: toStr },
    pipeline: { by_stage: [], by_agent: [], by_lineage: [] },
    closed_deals: [],
    monthly_summary: months_list.map((month) => ({
      month,
      new_deals: 0,
      closed: 0,
      lost: 0,
      close_rate: 0,
    })),
    lead_time: { avg_days: null, min_days: null, max_days: null, n: 0 },
    notes: notes.join(' '),
  };
}
