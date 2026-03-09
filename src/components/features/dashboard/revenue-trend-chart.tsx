'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CHART_COLORS, CHART_DEFAULTS, formatKpiValue, formatKpiYAxis } from './chart-config';
import type { RevenueTrendResponse } from '@/types/dashboard';

interface Props {
  data: RevenueTrendResponse | undefined;
  year: number;
  onYearChange: (year: number) => void;
  isLoading?: boolean;
  kpiLabel?: string;
  kpiUnit?: string;
}

function formatValue(value: number, unit?: string): string {
  return formatKpiValue(value, unit);
}

function formatYAxisValue(value: number, unit?: string): string {
  return formatKpiYAxis(value, unit);
}

function CustomTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string; unit?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-card p-3 rounded-lg shadow-lg border text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className={entry.dataKey === 'actualAmount' ? 'text-blue-600' : 'text-gray-500'}>
          {entry.dataKey === 'actualAmount' ? '実績' : '目標'}: {formatValue(entry.value, unit)}
        </p>
      ))}
    </div>
  );
}

export function RevenueTrendChart({ data, year, onYearChange, isLoading, kpiLabel, kpiUnit }: Props) {
  // APIレスポンスの kpiLabel を優先、なければ props、なければデフォルト
  const chartLabel = data?.kpiLabel ?? kpiLabel ?? '売上';
  const chartUnit = data?.kpiUnit ?? kpiUnit;

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{chartLabel}推移</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onYearChange(year - 1)} aria-label="前年度">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-16 text-center">{year}年度</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onYearChange(year + 1)} aria-label="翌年度">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      ) : (
        <div className="h-[220px] sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.months} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => formatYAxisValue(v, chartUnit)} tick={{ fontSize: 12 }} width={60} />
            <Tooltip content={<CustomTooltip unit={chartUnit} />} />
            <Legend
              formatter={(value: string) => (value === 'actualAmount' ? '実績' : '目標')}
              wrapperStyle={{ fontSize: '12px' }}
            />
            <Bar dataKey="actualAmount" fill={CHART_COLORS.primary} barSize={CHART_DEFAULTS.barSize} radius={[4, 4, 0, 0]} />
            <Line
              dataKey="targetAmount"
              stroke={CHART_COLORS.secondary}
              strokeWidth={CHART_DEFAULTS.lineStrokeWidth}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
