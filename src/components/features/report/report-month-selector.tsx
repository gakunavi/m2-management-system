'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  month: string;
  onChange: (month: string) => void;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ReportMonthSelector({ month, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium min-w-[100px] text-center">
        {formatMonthLabel(month)}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
