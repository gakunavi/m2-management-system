'use client';

import { SalesStatusFilter } from '@/components/features/project/sales-status-filter';
import { ExpectedCloseMonthFilter } from '@/components/features/project/expected-close-month-filter';

interface StatusOption {
  statusCode: string;
  statusLabel: string;
  statusColor: string | null;
}

interface Props {
  statusDefinitions: StatusOption[];
  selectedStatuses: string[];
  onStatusChange: (statuses: string[]) => void;
  monthFrom: string | null;
  monthTo: string | null;
  onMonthChange: (from: string | null, to: string | null) => void;
}

export function ProjectFilterPanel({
  statusDefinitions,
  selectedStatuses,
  onStatusChange,
  monthFrom,
  monthTo,
  onMonthChange,
}: Props) {
  return (
    <div className="bg-card rounded-lg border p-3 sm:p-4 space-y-4">
      {statusDefinitions.length > 0 && (
        <SalesStatusFilter
          statusDefinitions={statusDefinitions}
          selectedStatuses={selectedStatuses}
          onStatusChange={onStatusChange}
        />
      )}
      <ExpectedCloseMonthFilter
        monthFrom={monthFrom}
        monthTo={monthTo}
        onChange={onMonthChange}
      />
    </div>
  );
}
