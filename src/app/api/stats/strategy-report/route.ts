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
  const agentAgg = new Map<string, { active_deals: number; stages: Map<string, number> }>();
  for (const p of activeProjects) {
    const name = agentName(p);
    const entry = agentAgg.get(name) ?? { active_deals: 0, stages: new Map<string, number>() };
    entry.active_deals += 1;
    const label = statusLabelMap.get(p.projectSalesStatus) ?? p.projectSalesStatus;
    entry.stages.set(label, (entry.stages.get(label) ?? 0) + 1);
    agentAgg.set(name, entry);
  }
  const by_agent = Array.from(agentAgg.entries())
    .sort((a, b) => b[1].active_deals - a[1].active_deals)
    .map(([agent, v]) => ({
      agent,
      active_deals: v.active_deals,
      stages: Object.fromEntries(v.stages),
    }));

  // --- closed_deals（成約案件・期間内） -----------------------------------
  const closed_deals = projects
    .filter((p) => wonCodes.has(p.projectSalesStatus))
    .map((p) => ({ p, month: closeMonthOf(p) }))
    .filter(({ month }) => month !== null && month >= fromYm && month <= currentYm)
    .sort((a, b) => (a.month! < b.month! ? -1 : 1))
    .map(({ p, month }) => ({
      closed_month: month,
      agent: agentName(p),
      units: unitsOf(p),
      amount: amountField ? amountOf(p) : null,
      lead_time_days: null as number | null,
      customer_ref: `cust_${p.customerId}`,
    }));

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
    pipeline: { by_stage, by_agent },
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
    pipeline: { by_stage: [], by_agent: [] },
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
