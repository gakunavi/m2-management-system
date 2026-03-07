'use client';

import { memo } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentMonth } from '@/lib/revenue-helpers';

interface Props {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

export const DashboardMonthFilter = memo(function DashboardMonthFilter({
  selectedMonth,
  onMonthChange,
}: Props) {
  const currentMonth = getCurrentMonth();
  const isCurrentMonth = selectedMonth === currentMonth;

  // 月ラベル表示（例: "2026年3月"）
  const [y, m] = selectedMonth.split('-');
  const monthLabel = `${y}年${parseInt(m, 10)}月`;

  return (
    <div className="flex items-center gap-3">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />
      <input
        type="month"
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        value={selectedMonth}
        onChange={(e) => onMonthChange(e.target.value)}
      />
      {!isCurrentMonth && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(currentMonth)}
        >
          当月に戻す
        </Button>
      )}
      <span className="text-sm text-muted-foreground">
        {monthLabel}のデータを表示中
      </span>
    </div>
  );
});
