'use client';

import { memo } from 'react';
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CHART_COLORS, CHART_DEFAULTS, formatCurrency, formatYAxis } from './chart-config';
import type { ProfitResponse, ProfitTotals } from '@/types/dashboard';

// ============================================
// 収益セクション（自社売上・代理店支払手数料・粗利）
// ============================================
//
// 取扱高（顧客が支払う総額）と自社売上（取り分適用後）は別物なので、
// 混同しないよう自社売上カードに取扱高を併記する。
// 「粗利」は売上総利益。経常利益は販管費・営業外を含む全社の数字で
// 事業別には配賦なしに出せないため、ここでは扱わない。
//
// 計上基準はダッシュボードの売上KPIと同じ（同じ金額フィールド・同じ計上月・
// 同じ営業ステータス条件）。締め・支払明細の確定ベースとは別なので、
// 数字が食い違いうることを画面上でも明示する。

interface Props {
  data: ProfitResponse | undefined;
  isLoading?: boolean;
  /** 事業別内訳を表示するか（会社全体モード） */
  showBusinessBreakdown?: boolean;
}

type ChangeType = 'positive' | 'negative' | 'neutral';

const changeColors: Record<ChangeType, string> = {
  positive: 'text-green-600',
  negative: 'text-red-600',
  neutral: 'text-muted-foreground',
};

function ChangeIcon({ type }: { type: ChangeType }) {
  if (type === 'positive') return <TrendingUp className="h-3.5 w-3.5" />;
  if (type === 'negative') return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function resolveChangeType(current: number, previous: number): ChangeType {
  if (current > previous) return 'positive';
  if (current < previous) return 'negative';
  return 'neutral';
}

/** 前月比の説明文。前月データが無い期間モードでは null */
function changeText(current: number, previous: ProfitTotals | null, pick: (t: ProfitTotals) => number): {
  text: string;
  type: ChangeType;
} | null {
  if (!previous) return null;
  const prev = pick(previous);
  if (prev === 0) return { text: '前月データなし', type: 'neutral' };
  // 分母は絶対値。粗利がマイナスの月を基準にすると符号が反転し、
  // 悪化しているのに「+200%」と出てしまうため
  const rate = Math.round(((current - prev) / Math.abs(prev)) * 1000) / 10;
  return {
    text: `${rate > 0 ? '+' : ''}${rate.toFixed(1)}% 前月比`,
    type: resolveChangeType(current, prev),
  };
}

const formatMargin = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '-');

/**
 * 台数。事業に台数フィールドが無い場合は null で来るので「-」を出す。
 * 0台と「台数という概念が無い事業」を同じ見た目にしないため 0 は 0 と出す。
 */
const formatUnits = (v: number | null) => (v != null ? `${v.toLocaleString()}台` : '-');

function ProfitCard({
  label,
  value,
  sub,
  change,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  change: { text: string; type: ChangeType } | null;
  accent: string;
}) {
  return (
    <div className={`rounded-lg border border-l-4 bg-card p-5 shadow-sm ${accent}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      {change && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${changeColors[change.type]}`}>
          <ChangeIcon type={change.type} />
          <span>{change.text}</span>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; name: string }>;
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="bg-card p-3 rounded-lg shadow-lg border text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

/** 選択中の月を強調する色（KPI推移グラフと合わせる） */
const HIGHLIGHT_COLOR = '#1d4ed8';

const SERIES_LABELS: Record<string, string> = {
  companyRevenue: '自社売上',
  rewardTotal: '代理店支払手数料',
  grossProfit: '粗利',
};

export const ProfitSection = memo(function ProfitSection({ data, isLoading, showBusinessBreakdown }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 animate-pulse">
            <div className="h-4 w-20 bg-muted rounded mb-3" />
            <div className="h-7 w-32 bg-muted rounded mb-2" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  // 自社取り分が未設定の事業しかない場合は、誤解を招く 0 円/マイナス粗利を出さず
  // 設定への導線だけを示す
  if (!data || !data.enabled) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-1">収益（自社売上・粗利）</h3>
        <p className="text-sm text-muted-foreground">
          事業マスタの「代理店支払手数料」設定にある<strong>自社取り分</strong>が未設定のため表示できません。
          取扱高のうち自社の売上になる割合を設定すると、自社売上・粗利・粗利率が表示されます。
        </p>
      </div>
    );
  }

  const { totals, previous, months } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
        <ProfitCard
          label="自社売上"
          value={formatCurrency(totals.companyRevenue, true)}
          sub={`取扱高 ${formatCurrency(totals.gmv, true)}`}
          change={changeText(totals.companyRevenue, previous, (t) => t.companyRevenue)}
          accent="border-l-primary"
        />
        <ProfitCard
          label="代理店支払手数料"
          value={formatCurrency(totals.rewardTotal, true)}
          sub="代理店へ支払う手数料の合計"
          change={changeText(totals.rewardTotal, previous, (t) => t.rewardTotal)}
          accent="border-l-warning"
        />
        <ProfitCard
          label="粗利"
          value={formatCurrency(totals.grossProfit, true)}
          sub="自社売上 − 代理店支払手数料（税抜）"
          change={changeText(totals.grossProfit, previous, (t) => t.grossProfit)}
          accent="border-l-success"
        />
        <ProfitCard
          label="粗利率"
          value={formatMargin(totals.grossMargin)}
          sub={`取扱高比 ${formatMargin(totals.grossMarginOnGmv)} ／ 対象案件 ${totals.projectCount.toLocaleString()}件`}
          change={null}
          accent="border-l-info"
        />
      </div>

      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h3 className="font-semibold">収益推移</h3>
          <span className="text-sm font-medium text-muted-foreground">{data.year}年度</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          売上KPIと同じ金額・計上月・営業ステータスで集計（見込みベース）。
          グラフは年度（4月開始）の12ヶ月で、上のカードは期間フィルターの合計です。
        </p>
        {months.every((m) => m.gmv === 0 && m.rewardTotal === 0) ? (
          <div className="h-40 flex items-center justify-center text-center text-muted-foreground text-sm px-4">
            {data.year}年度に計上される案件がありません。
            年度を切り替えるか、売上KPIの対象ステータス・計上月フィールドの設定をご確認ください。
          </div>
        ) : (
          <div className="h-[220px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={months} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(value: string) => SERIES_LABELS[value] ?? value}
                  wrapperStyle={{ fontSize: '12px' }}
                />
                <Bar
                  dataKey="companyRevenue"
                  name={SERIES_LABELS.companyRevenue}
                  fill={CHART_COLORS.primary}
                  barSize={CHART_DEFAULTS.barSize}
                  radius={[4, 4, 0, 0]}
                >
                  {/* 単月モードのときは選択中の月を濃色で強調（上のKPI推移と同じ挙動） */}
                  {data.highlightMonth &&
                    months.map((m) => (
                      <Cell
                        key={m.month}
                        fill={m.month === data.highlightMonth ? HIGHLIGHT_COLOR : CHART_COLORS.primary}
                        fillOpacity={m.month === data.highlightMonth ? 1 : 0.6}
                      />
                    ))}
                </Bar>
                <Bar
                  dataKey="rewardTotal"
                  name={SERIES_LABELS.rewardTotal}
                  fill={CHART_COLORS.warning}
                  barSize={CHART_DEFAULTS.barSize}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  dataKey="grossProfit"
                  name={SERIES_LABELS.grossProfit}
                  stroke={CHART_COLORS.success}
                  strokeWidth={CHART_DEFAULTS.lineStrokeWidth}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {data.projects.length > 0 && (
        <div className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="font-semibold">案件別の内訳</h3>
            <p className="text-xs text-muted-foreground">
              金額の大きい順。代理店欄が「直販」の案件は手数料が発生しません
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-normal py-2 pr-4">案件番号</th>
                  <th className="text-left font-normal py-2 pr-4">顧客</th>
                  <th className="text-left font-normal py-2 pr-4">代理店</th>
                  <th className="text-right font-normal py-2 pr-4">台数</th>
                  <th className="text-right font-normal py-2 pr-4">取扱高</th>
                  <th className="text-right font-normal py-2 pr-4">自社売上</th>
                  <th className="text-right font-normal py-2 pr-4">支払手数料</th>
                  <th className="text-right font-normal py-2 pr-4">粗利</th>
                  <th className="text-right font-normal py-2">粗利率（自社売上比）</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.projectId} className="border-b last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <a href={`/projects/${p.projectId}`} className="text-primary hover:underline">
                        {p.projectNo}
                      </a>
                    </td>
                    <td className="py-2 pr-4">{p.customerName ?? '-'}</td>
                    <td className="py-2 pr-4">
                      {p.partnerName ?? <span className="text-muted-foreground">直販</span>}
                    </td>
                    <td className="py-2 pr-4 text-right">{formatUnits(p.units)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(p.gmv, true)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(p.companyRevenue, true)}</td>
                    <td
                      className={`py-2 pr-4 text-right ${
                        p.partnerName && p.rewardTotal === 0 ? 'text-amber-600' : ''
                      }`}
                    >
                      {formatCurrency(p.rewardTotal, true)}
                    </td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(p.grossProfit, true)}</td>
                    <td className="py-2 text-right">
                      {formatMargin(p.grossMargin)}
                      <span className="block text-xs text-muted-foreground">
                        （取扱高比 {formatMargin(p.grossMarginOnGmv)}）
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            代理店が付いているのに支払手数料が¥0の案件は
            <span className="text-amber-600">オレンジ</span>で表示されます。
            その代理店の料率が未設定か、階層設定を確認してください。
          </p>
        </div>
      )}

      {showBusinessBreakdown && data.businesses && data.businesses.length > 0 && (
        <div className="rounded-lg border bg-card p-5">
          <h3 className="font-semibold mb-3">事業別の収益</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left font-normal py-2 pr-4">事業</th>
                  <th className="text-right font-normal py-2 pr-4">取扱高</th>
                  <th className="text-right font-normal py-2 pr-4">自社売上</th>
                  <th className="text-right font-normal py-2 pr-4">代理店支払手数料</th>
                  <th className="text-right font-normal py-2 pr-4">粗利</th>
                  <th className="text-right font-normal py-2">粗利率（自社売上比）</th>
                </tr>
              </thead>
              <tbody>
                {data.businesses.map((b) => (
                  <tr key={b.businessId} className="border-b last:border-0">
                    <td className="py-2 pr-4">{b.businessName}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(b.gmv, true)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(b.companyRevenue, true)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(b.rewardTotal, true)}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(b.grossProfit, true)}</td>
                    <td className="py-2 text-right">
                      {formatMargin(b.grossMargin)}
                      <span className="block text-xs text-muted-foreground">
                        （取扱高比 {formatMargin(b.grossMarginOnGmv)}）
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});
