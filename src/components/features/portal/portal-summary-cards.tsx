'use client';

import { formatCurrency } from '@/components/features/dashboard/chart-config';
import type { PortalBusinessSummary } from '@/types/dashboard';

interface Props {
  businesses: PortalBusinessSummary[] | undefined;
  totals: { totalAmount: number; projectCount: number; wonProjectCount: number } | undefined;
  selectedBusinessId: number | null;
  onBusinessClick: (businessId: number | null) => void;
  isLoading?: boolean;
}

export function PortalSummaryCards({
  businesses,
  totals,
  selectedBusinessId,
  onBusinessClick,
  isLoading,
}: Props) {
  if (isLoading || !businesses) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 animate-pulse">
            <div className="h-4 w-24 bg-muted rounded mb-3" />
            <div className="h-6 w-32 bg-muted rounded mb-2" />
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 合計カード */}
      {totals && (
        <div
          className={`rounded-lg border bg-card p-5 cursor-pointer transition-colors ${
            selectedBusinessId === null
              ? 'ring-2 ring-primary border-primary'
              : 'hover:border-primary/50'
          }`}
          onClick={() => onBusinessClick(null)}
        >
          <h3 className="text-sm font-medium text-muted-foreground mb-1">全事業合計</h3>
          <p className="text-2xl font-bold">{formatCurrency(totals.totalAmount)}</p>
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            <span>案件数: {totals.projectCount}件</span>
            <span>受注: {totals.wonProjectCount}件</span>
          </div>
        </div>
      )}

      {/* 事業別カード */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {businesses.map((biz) => (
          <div
            key={biz.businessId}
            className={`rounded-lg border bg-card p-5 cursor-pointer transition-colors ${
              selectedBusinessId === biz.businessId
                ? 'ring-2 ring-primary border-primary'
                : 'hover:border-primary/50'
            }`}
            onClick={() => onBusinessClick(biz.businessId)}
          >
            <h3 className="text-sm font-medium text-muted-foreground mb-1 truncate">
              {biz.businessName}
            </h3>
            <p className="text-xl font-bold">{formatCurrency(biz.totalAmount)}</p>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span>{biz.projectCount}件</span>
              <span>受注 {biz.wonProjectCount}件</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
