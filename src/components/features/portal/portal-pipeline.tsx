'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatKpiValue } from '@/components/features/dashboard/chart-config';

interface PipelineStatus {
  statusCode: string;
  statusLabel: string;
  statusColor: string;
  projectCount: number;
  totalAmount: number;
}

interface Props {
  data: { statuses: PipelineStatus[]; kpiUnit?: string } | undefined;
  isLoading?: boolean;
}

function CustomTooltip({
  active,
  payload,
  kpiUnit,
}: {
  active?: boolean;
  payload?: Array<{ payload: PipelineStatus }>;
  kpiUnit?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card p-3 rounded-lg shadow-lg border text-sm">
      <p className="font-medium mb-1">{d.statusLabel}</p>
      <p>{d.projectCount}件</p>
      <p>{formatKpiValue(d.totalAmount, kpiUnit)}</p>
    </div>
  );
}

export function PortalPipeline({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">パイプライン</h3>
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (data.statuses.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">パイプライン</h3>
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          データがありません
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold mb-4">パイプライン</h3>

      <ResponsiveContainer width="100%" height={Math.max(200, data.statuses.length * 44)}>
        <BarChart data={data.statuses} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="statusLabel"
            tick={{ fontSize: 12 }}
            width={80}
          />
          <Tooltip content={<CustomTooltip kpiUnit={data.kpiUnit} />} />
          <Bar dataKey="projectCount" radius={[0, 4, 4, 0]} barSize={24}>
            {data.statuses.map((entry) => (
              <Cell key={entry.statusCode} fill={entry.statusColor || '#6b7280'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-3 space-y-1.5">
        {data.statuses.map((s) => (
          <div key={s.statusCode} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: s.statusColor || '#6b7280' }}
              />
              <span>{s.statusLabel}</span>
            </div>
            <div className="text-muted-foreground">
              {s.projectCount}件 / {formatKpiValue(s.totalAmount, data.kpiUnit, true)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
