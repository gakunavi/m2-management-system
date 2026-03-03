'use client';

import type { KpiDefinition } from '@/types/dashboard';

interface Props {
  kpiDefinitions: KpiDefinition[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

export function KpiTabSelector({ kpiDefinitions, selectedKey, onSelect }: Props) {
  if (kpiDefinitions.length <= 1) return null;

  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
      {kpiDefinitions.map((kpi) => (
        <button
          key={kpi.key}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            selectedKey === kpi.key
              ? 'bg-background shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => onSelect(kpi.key)}
        >
          {kpi.label}
        </button>
      ))}
    </div>
  );
}
