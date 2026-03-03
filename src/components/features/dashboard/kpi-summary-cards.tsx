'use client';

import { memo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency } from './chart-config';
import type { DashboardSummary } from '@/types/dashboard';

interface Props {
  data: DashboardSummary | undefined;
  isLoading?: boolean;
}

interface KpiCard {
  label: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
}

const accentColors = [
  'border-l-primary',
  'border-l-info',
  'border-l-warning',
  'border-l-success',
];

function buildCards(data: DashboardSummary): KpiCard[] {
  return [
    {
      label: '売上実績',
      value: formatCurrency(data.revenue.current, true),
      change: data.revenue.previous > 0
        ? `${data.revenue.changeRate > 0 ? '+' : ''}${data.revenue.changeRate.toFixed(1)}% 前月比`
        : '前月データなし',
      changeType: data.revenue.changeType,
    },
    {
      label: '目標達成率',
      value: `${data.achievementRate.current.toFixed(1)}%`,
      change: `${data.achievementRate.changePoints > 0 ? '+' : ''}${data.achievementRate.changePoints.toFixed(1)}pt 前月比`,
      changeType: data.achievementRate.changeType,
    },
    {
      label: '案件総数',
      value: `${data.totalProjects.current.toLocaleString()}件`,
      change: `${data.totalProjects.change > 0 ? '+' : ''}${data.totalProjects.change}件 前月比`,
      changeType: data.totalProjects.changeType,
    },
    {
      label: '受注案件数',
      value: `${data.wonProjects.current.toLocaleString()}件`,
      change: `${data.wonProjects.change > 0 ? '+' : ''}${data.wonProjects.change}件 前月比`,
      changeType: data.wonProjects.changeType,
    },
  ];
}

const changeColors = {
  positive: 'text-green-600',
  negative: 'text-red-600',
  neutral: 'text-muted-foreground',
};

function ChangeIcon({ type }: { type: 'positive' | 'negative' | 'neutral' }) {
  if (type === 'positive') return <TrendingUp className="h-3.5 w-3.5" />;
  if (type === 'negative') return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

export const KpiSummaryCards = memo(function KpiSummaryCards({ data, isLoading }: Props) {
  if (isLoading || !data) {
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

  const cards = buildCards(data);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card, index) => (
        <div key={card.label} className={`rounded-lg border border-l-4 bg-card p-5 shadow-sm ${accentColors[index]}`}>
          <p className="text-sm text-muted-foreground">{card.label}</p>
          <p className="text-2xl font-bold mt-1">{card.value}</p>
          <div className={`flex items-center gap-1 mt-2 text-xs ${changeColors[card.changeType]}`}>
            <ChangeIcon type={card.changeType} />
            <span>{card.change}</span>
          </div>
        </div>
      ))}
    </div>
  );
});
