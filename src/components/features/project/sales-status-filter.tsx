'use client';

import { cn } from '@/lib/utils';

interface StatusOption {
  statusCode: string;
  statusLabel: string;
  statusColor: string | null;
}

interface Props {
  statusDefinitions: StatusOption[];
  selectedStatuses: string[];
  onStatusChange: (statuses: string[]) => void;
}

export function SalesStatusFilter({ statusDefinitions, selectedStatuses, onStatusChange }: Props) {
  const isAllSelected = selectedStatuses.length === 0;

  const handleToggle = (statusCode: string) => {
    if (selectedStatuses.includes(statusCode)) {
      onStatusChange(selectedStatuses.filter((s) => s !== statusCode));
    } else {
      onStatusChange([...selectedStatuses, statusCode]);
    }
  };

  const handleAllClick = () => {
    onStatusChange([]);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">営業ステータスで絞り込み</p>
      <div className="flex flex-wrap gap-2">
        {/* すべてボタン */}
        <button
          type="button"
          onClick={handleAllClick}
          className={cn(
            'px-3 py-1 text-xs rounded-full font-medium transition-all border',
            isAllSelected
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground bg-muted border-transparent hover:bg-muted/80',
          )}
        >
          すべて
        </button>

        {/* 各ステータスボタン */}
        {statusDefinitions.map((sd) => {
          const isSelected = selectedStatuses.includes(sd.statusCode);
          return (
            <button
              key={sd.statusCode}
              type="button"
              onClick={() => handleToggle(sd.statusCode)}
              className={cn(
                'px-3 py-1 text-xs rounded-full font-medium transition-all border',
                isSelected
                  ? 'text-white ring-2 ring-offset-1'
                  : 'text-muted-foreground bg-muted border-transparent hover:bg-muted/80',
              )}
              style={
                isSelected && sd.statusColor
                  ? { backgroundColor: sd.statusColor, borderColor: sd.statusColor }
                  : isSelected
                    ? { backgroundColor: '#6B7280', borderColor: '#6B7280' }
                    : undefined
              }
            >
              {sd.statusLabel}
              {isSelected && <span className="ml-1">✓</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">複数選択可能・クリックで切り替え</p>
    </div>
  );
}
