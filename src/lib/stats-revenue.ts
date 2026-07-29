import { calcMarginPercent, type MonthlyPL, type ProjectMonthPL } from '@/lib/profit-helpers';

// ============================================
// 統計API（/api/stats/strategy-report）の revenue セクション組み立て
// ============================================
//
// 金額の計算そのものは一切ここでしない。profit-helpers（＝ダッシュボードの
// 収益セクションと同じ実装）が出した月次P/Lと案件×月の内訳を、
// 外部向けのスネークケース JSON に整形・ロールアップするだけ。
//
// DB に依存しない純粋関数にしてあるのは、ゼロ埋め・台数の重複回避・
// 代理店別ロールアップといった「集計の約束事」をテストで固定するため。

export interface RevenueMonth {
  month: string;
  gmv: number;
  units: number | null;
  company_revenue: number;
  reward_direct: number;
  reward_indirect: number;
  reward_total: number;
  gross_profit: number;
  gross_margin: number | null;
  gross_margin_on_gmv: number | null;
  project_count: number;
}

export type RevenueTotals = Omit<RevenueMonth, 'month'>;

export interface RevenueProject {
  project_no: string;
  customer_ref: string;
  month: string;
  partner: string | null;
  lineage: string;
  tier: string | null;
  sales_status: string;
  sales_status_label: string;
  is_recognition_month: boolean;
  gmv: number;
  units: number | null;
  company_revenue: number;
  reward_total: number;
  gross_profit: number;
  gross_margin: number | null;
  gross_margin_on_gmv: number | null;
}

export interface RevenuePartner {
  partner: string | null;
  partner_id: number | null;
  lineage: string;
  tier: string | null;
  gmv: number;
  units: number | null;
  company_revenue: number;
  reward_total: number;
  gross_profit: number;
  gross_margin: number | null;
  gross_margin_on_gmv: number | null;
  project_count: number;
}

export interface RevenueSection {
  by_month: RevenueMonth[];
  by_project: RevenueProject[];
  by_partner: RevenuePartner[];
  totals: RevenueTotals;
}

export interface RevenueSectionInput {
  /** 返す月の並び（実績が無い月も 0 で埋めて必ず並べる） */
  monthsList: string[];
  /** profit-helpers の月次P/L（実績のある月のみ） */
  months: MonthlyPL[];
  /** profit-helpers の案件×計上月の内訳 */
  rows: ProjectMonthPL[];
  /** 期間合計（sumMonthlyPL の結果） */
  totals: Omit<MonthlyPL, 'month'>;
  /**
   * 案件の台数。台数フィールドが事業設定から解決できない場合は null を返す実装にする。
   * 「台数が取れない」と「台数0」を区別するため、undefined ではなく null。
   */
  unitsOf: (projectId: number) => number | null;
  /** 台数フィールドが解決できているか。false なら units は一律 null で返す */
  unitsResolved: boolean;
  /** 代理店ID → 系列・階層（統計API本体の agentMetaOf を渡す） */
  metaOf: (partnerId: number | null) => { lineage: string; tier: string | null };
  /** 営業ステータスコード → 表示ラベル */
  statusLabelOf: (code: string) => string;
}

export function buildRevenueSection(input: RevenueSectionInput): RevenueSection {
  const { monthsList, months, rows, totals, unitsOf, unitsResolved, metaOf, statusLabelOf } = input;

  const bucketByMonth = new Map<string, MonthlyPL>(months.map((m) => [m.month, m]));

  // 台数は案件の計上初月にだけ1回計上する。ストック展開した月に重ねると
  // 「台数だけが契約月数ぶん膨らむ」表になるため。
  const unitsOfRow = (r: ProjectMonthPL): number | null => {
    if (!unitsResolved || !r.isRecognitionMonth) return null;
    return unitsOf(r.projectId);
  };
  const sumUnits = (rs: ProjectMonthPL[]): number | null =>
    unitsResolved ? rs.reduce((acc, r) => acc + (unitsOfRow(r) ?? 0), 0) : null;

  const rowsByMonth = new Map<string, ProjectMonthPL[]>();
  for (const r of rows) {
    const list = rowsByMonth.get(r.month) ?? [];
    list.push(r);
    rowsByMonth.set(r.month, list);
  }

  const by_month: RevenueMonth[] = monthsList.map((month) => {
    const b = bucketByMonth.get(month);
    return {
      month,
      gmv: b?.gmv ?? 0,
      units: sumUnits(rowsByMonth.get(month) ?? []),
      company_revenue: b?.companyRevenue ?? 0,
      reward_direct: b?.rewardDirect ?? 0,
      reward_indirect: b?.rewardIndirect ?? 0,
      reward_total: b?.rewardTotal ?? 0,
      gross_profit: b?.grossProfit ?? 0,
      gross_margin: b?.grossMargin ?? null,
      gross_margin_on_gmv: b?.grossMarginOnGmv ?? null,
      project_count: b?.projectCount ?? 0,
    };
  });

  const by_project: RevenueProject[] = rows.map((r) => {
    const meta = metaOf(r.partnerId);
    return {
      project_no: r.projectNo,
      // 顧客名・会社名は返さない（既存の匿名方針）
      customer_ref: `cust_${r.customerId}`,
      month: r.month,
      partner: r.partnerName,
      lineage: meta.lineage,
      tier: meta.tier,
      sales_status: r.salesStatus,
      sales_status_label: statusLabelOf(r.salesStatus),
      is_recognition_month: r.isRecognitionMonth,
      gmv: r.gmv,
      units: unitsOfRow(r),
      company_revenue: r.companyRevenue,
      reward_total: r.rewardTotal,
      gross_profit: r.grossProfit,
      gross_margin: r.grossMargin,
      gross_margin_on_gmv: r.grossMarginOnGmv,
    };
  });

  // 代理店別ロールアップ（担当代理店ベース。代理店なし＝直販は partner: null の1行）
  const partnerAgg = new Map<string, { partnerId: number | null; rows: ProjectMonthPL[] }>();
  for (const r of rows) {
    const key = r.partnerId == null ? '__direct__' : `p${r.partnerId}`;
    const e = partnerAgg.get(key) ?? { partnerId: r.partnerId, rows: [] };
    e.rows.push(r);
    partnerAgg.set(key, e);
  }
  const by_partner: RevenuePartner[] = Array.from(partnerAgg.values())
    .map(({ partnerId, rows: prs }) => {
      const meta = metaOf(partnerId);
      const gmv = prs.reduce((a, r) => a + r.gmv, 0);
      const company_revenue = prs.reduce((a, r) => a + r.companyRevenue, 0);
      const reward_total = prs.reduce((a, r) => a + r.rewardTotal, 0);
      const gross_profit = company_revenue - reward_total;
      return {
        partner: partnerId == null ? null : prs[0].partnerName,
        partner_id: partnerId,
        lineage: meta.lineage,
        tier: meta.tier,
        gmv,
        units: sumUnits(prs),
        company_revenue,
        reward_total,
        gross_profit,
        // 率は必ず profit-helpers と同じ丸めで出す（合計は合うのに率だけズレるのを防ぐ）
        gross_margin: calcMarginPercent(gross_profit, company_revenue),
        gross_margin_on_gmv: calcMarginPercent(gross_profit, gmv),
        project_count: new Set(prs.map((r) => r.projectId)).size,
      };
    })
    .sort((a, b) => b.gmv - a.gmv);

  return {
    by_month,
    by_project,
    by_partner,
    totals: {
      gmv: totals.gmv,
      units: sumUnits(rows),
      company_revenue: totals.companyRevenue,
      reward_direct: totals.rewardDirect,
      reward_indirect: totals.rewardIndirect,
      reward_total: totals.rewardTotal,
      gross_profit: totals.grossProfit,
      gross_margin: totals.grossMargin,
      gross_margin_on_gmv: totals.grossMarginOnGmv,
      project_count: totals.projectCount,
    },
  };
}
