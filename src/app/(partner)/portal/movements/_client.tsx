'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, ArrowUp, ArrowDown, BarChart3, CheckCircle, Circle, Play, SkipForward } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { StatusBadge } from '@/components/ui/status-badge';
import { SalesStatusFilter } from '@/components/features/project/sales-status-filter';
import { ExpectedCloseMonthFilter } from '@/components/features/project/expected-close-month-filter';
import type { MovementOverviewResponse, MovementItem } from '@/types/movement';
import { useBusiness } from '@/hooks/use-business';
import { useStatusDefinitions } from '@/hooks/use-status-definitions';
import { cn } from '@/lib/utils';
import type { MovementStatus } from '@/lib/validations/movement';

const STATUS_CELL: Record<MovementStatus, { bg: string; icon: typeof CheckCircle; iconColor: string }> = {
  pending:   { bg: 'bg-gray-50',    icon: Circle,      iconColor: 'text-gray-400' },
  started:   { bg: 'bg-blue-50',    icon: Play,        iconColor: 'text-blue-600' },
  completed: { bg: 'bg-green-50',   icon: CheckCircle, iconColor: 'text-green-600' },
  skipped:   { bg: 'bg-yellow-50',  icon: SkipForward, iconColor: 'text-yellow-600' },
};

function formatCompactDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type SortDirection = 'asc' | 'desc' | null;

export function PortalMovementsClient() {
  const router = useRouter();
  const { selectedBusinessId, hasHydrated } = useBusiness();
  const [selectedStatuses, setSelectedStatuses] = useState<string[] | null>(null);
  const [statusSort, setStatusSort] = useState<SortDirection>(null);
  const [monthSort, setMonthSort] = useState<SortDirection>(null);
  const [expectedMonthFrom, setExpectedMonthFrom] = useState<string | null>(null);
  const [expectedMonthTo, setExpectedMonthTo] = useState<string | null>(null);
  const prevBusinessIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (hasHydrated && !selectedBusinessId) {
      router.replace('/portal');
    }
  }, [hasHydrated, selectedBusinessId, router]);

  // 事業切替時にフィルターをリセット
  useEffect(() => {
    if (selectedBusinessId && prevBusinessIdRef.current !== selectedBusinessId) {
      setSelectedStatuses(null);
      setExpectedMonthFrom(null);
      setExpectedMonthTo(null);
      prevBusinessIdRef.current = selectedBusinessId;
    }
  }, [selectedBusinessId]);

  // ステータス定義を先に取得してデフォルトフィルターを設定（失注・最終を除外）
  const { items: allStatusDefs } = useStatusDefinitions(selectedBusinessId ?? 0);

  useEffect(() => {
    if (allStatusDefs.length > 0 && selectedStatuses === null) {
      const activeStatuses = allStatusDefs
        .filter((s) => s.statusIsActive && !s.statusIsFinal && !s.statusIsLost)
        .map((s) => s.statusCode);
      setSelectedStatuses(activeStatuses);
    }
  }, [allStatusDefs, selectedStatuses]);

  const { data, isLoading, error } = useQuery<MovementOverviewResponse>({
    queryKey: ['portal-movements-overview', selectedBusinessId, selectedStatuses, expectedMonthFrom, expectedMonthTo],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId: String(selectedBusinessId) });
      if (selectedStatuses && selectedStatuses.length > 0) {
        params.set('statuses', selectedStatuses.join(','));
      }
      if (expectedMonthFrom) params.set('expectedCloseMonthFrom', expectedMonthFrom);
      if (expectedMonthTo) params.set('expectedCloseMonthTo', expectedMonthTo);
      const res = await fetch(`/api/v1/portal/movements?${params.toString()}`);
      if (!res.ok) throw new Error('取得に失敗しました');
      return res.json() as Promise<MovementOverviewResponse>;
    },
    enabled: !!selectedBusinessId && selectedStatuses !== null,
  });

  const templates = data?.meta?.templates ?? [];
  const statusDefinitions = data?.meta?.statusDefinitions ?? [];
  const rawProjects = data?.data ?? [];

  // ソート切替ハンドラ（各列独立で asc → desc → 解除）
  const toggleSort = (setter: React.Dispatch<React.SetStateAction<SortDirection>>) => {
    setter((prev) => (prev === null ? 'asc' : prev === 'asc' ? 'desc' : null));
  };

  // ステータスのソート順マップ（statusDefinitionsから構築、fallbackでallStatusDefs）
  const statusSortMap = useMemo(() => {
    const map = new Map<string, number>();
    if (statusDefinitions.length > 0) {
      statusDefinitions.forEach((s, i) => map.set(s.statusCode, s.statusSortOrder ?? i));
    } else {
      allStatusDefs.forEach((s) => map.set(s.statusCode, s.statusSortOrder));
    }
    return map;
  }, [statusDefinitions, allStatusDefs]);

  // ソート済み案件リスト（両方独立に適用、営業ステータス→受注予定月の順で比較）
  const projects = useMemo(() => {
    if (!statusSort && !monthSort) return rawProjects;
    return [...rawProjects].sort((a, b) => {
      if (statusSort) {
        const aOrder = statusSortMap.get(a.projectSalesStatus) ?? Infinity;
        const bOrder = statusSortMap.get(b.projectSalesStatus) ?? Infinity;
        const cmp = aOrder - bOrder;
        if (cmp !== 0) return statusSort === 'desc' ? -cmp : cmp;
      }
      if (monthSort) {
        const aVal = a.projectExpectedCloseMonth ?? '';
        const bVal = b.projectExpectedCloseMonth ?? '';
        let cmp = 0;
        if (!aVal && !bVal) cmp = 0;
        else if (!aVal) cmp = 1;
        else if (!bVal) cmp = -1;
        else cmp = aVal.localeCompare(bVal);
        if (cmp !== 0) return monthSort === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }, [rawProjects, statusSort, monthSort, statusSortMap]);

  const minWidth = useMemo(() => 200 + templates.length * 120 + 140, [templates.length]);

  if (!hasHydrated || !selectedBusinessId) return <LoadingSpinner />;
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message="ムーブメント一覧の取得に失敗しました" />;

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" />
          案件ムーブメント
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          案件の進捗状況を一覧で確認できます
        </p>
      </div>

      {/* フィルター */}
      <div className="bg-card rounded-lg border p-3 sm:p-4 space-y-4">
        {statusDefinitions.length > 0 && (
          <SalesStatusFilter
            statusDefinitions={statusDefinitions}
            selectedStatuses={selectedStatuses ?? []}
            onStatusChange={setSelectedStatuses}
          />
        )}
        <ExpectedCloseMonthFilter
          monthFrom={expectedMonthFrom}
          monthTo={expectedMonthTo}
          onChange={(from, to) => {
            setExpectedMonthFrom(from);
            setExpectedMonthTo(to);
          }}
        />
      </div>

      {/* 凡例 */}
      <div className="bg-card rounded-lg border p-3 sm:p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">凡例</p>
        <div className="flex flex-wrap gap-2 sm:gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Circle className="h-3.5 w-3.5 text-gray-400" />
            <span>未着手</span>
          </div>
          <div className="flex items-center gap-1">
            <Play className="h-3.5 w-3.5 text-blue-600" />
            <span>進行中</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            <span>完了</span>
          </div>
          <div className="flex items-center gap-1">
            <SkipForward className="h-3.5 w-3.5 text-yellow-600" />
            <span>スキップ</span>
          </div>
        </div>
      </div>

      {/* マトリクス表 */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${minWidth}px` }}>
            {/* ヘッダー行 */}
            <div className="bg-muted border-b flex">
              <div
                className="w-[200px] sm:w-[280px] shrink-0 px-3 sm:px-4 py-3 border-r font-medium text-sm sticky left-0 bg-muted z-20 cursor-pointer select-none hover:brightness-95 transition-all"
                onClick={() => toggleSort(setMonthSort)}
              >
                <span className="flex items-center gap-1">
                  案件情報
                  <span className="text-xs text-muted-foreground">/ 受注予定月</span>
                  {monthSort === 'asc' ? (
                    <ArrowUp className="h-3.5 w-3.5 text-primary" />
                  ) : monthSort === 'desc' ? (
                    <ArrowDown className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </span>
              </div>
              <div
                className="w-[120px] sm:w-[140px] shrink-0 px-2 py-3 border-r text-xs text-center font-medium sticky left-[200px] sm:left-[280px] bg-muted z-20 cursor-pointer select-none hover:brightness-95 transition-all"
                onClick={() => toggleSort(setStatusSort)}
              >
                <span className="flex items-center justify-center gap-1 whitespace-nowrap">
                  営業ステータス
                  {statusSort === 'asc' ? (
                    <ArrowUp className="h-3 w-3 text-primary" />
                  ) : statusSort === 'desc' ? (
                    <ArrowDown className="h-3 w-3 text-primary" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                  )}
                </span>
              </div>
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="w-[120px] sm:w-[140px] shrink-0 px-2 py-3 border-r text-xs text-center font-medium"
                >
                  <div className="leading-tight">{t.stepName}</div>
                </div>
              ))}
            </div>

            {/* データ行 */}
            {projects.map((project) => (
              <div
                key={project.id}
                className="border-b flex hover:bg-accent/30 transition-colors"
              >
                <div className="w-[200px] sm:w-[280px] shrink-0 px-3 sm:px-4 py-3 border-r sticky left-0 bg-card z-10 hover:brightness-95 transition-all">
                  <div className="text-sm font-medium truncate" title={project.customerName ?? ''}>
                    {project.customerName ?? '顧客未設定'}
                  </div>
                  {project.projectNeeds && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate" title={project.projectNeeds}>
                      ニーズ：{project.projectNeeds}
                    </div>
                  )}
                  {project.projectExpectedCloseMonth && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      受注予定月：{project.projectExpectedCloseMonth}
                    </div>
                  )}
                </div>

                <div className="w-[120px] sm:w-[140px] shrink-0 px-2 py-3 border-r flex items-center justify-center sticky left-[200px] sm:left-[280px] bg-card z-10">
                  {project.projectSalesStatusLabel ? (
                    <StatusBadge
                      label={project.projectSalesStatusLabel}
                      color={project.projectSalesStatusColor}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </div>

                {templates.map((template) => {
                  const movement = project.movements.find(
                    (m: MovementItem) => m.templateId === template.id,
                  );

                  if (!movement) {
                    return (
                      <div
                        key={template.id}
                        className="w-[120px] sm:w-[140px] shrink-0 px-2 py-3 border-r flex items-center justify-center"
                      >
                        <Circle className="h-3.5 w-3.5 text-gray-300" />
                      </div>
                    );
                  }

                  const config = STATUS_CELL[movement.movementStatus as MovementStatus] ?? STATUS_CELL.pending;
                  const Icon = config.icon;

                  return (
                    <div
                      key={template.id}
                      className={cn(
                        'w-[120px] sm:w-[140px] shrink-0 px-2 py-3 border-r flex flex-col items-center justify-center',
                        config.bg,
                      )}
                    >
                      <Icon className={cn('h-4 w-4 mb-1', config.iconColor)} />
                      <div className="w-full bg-gray-200 rounded-full h-1 mb-1">
                        <div
                          className={cn(
                            'h-1 rounded-full transition-all',
                            movement.movementStatus === 'completed' && 'bg-green-500 w-full',
                            movement.movementStatus === 'started' && 'bg-blue-500 w-full',
                            movement.movementStatus === 'skipped' && 'bg-yellow-500 w-full',
                            movement.movementStatus === 'pending' && 'bg-gray-300 w-0',
                          )}
                        />
                      </div>
                      <div className="text-[10px] text-center space-y-0.5">
                        {movement.movementStartedAt && (
                          <div className="text-blue-600">
                            開始: {formatCompactDate(movement.movementStartedAt)}
                          </div>
                        )}
                        {movement.movementCompletedAt && (
                          <div className="text-green-600">
                            完了: {formatCompactDate(movement.movementCompletedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {projects.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                該当する案件がありません
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 件数表示 */}
      <p className="text-xs text-muted-foreground">
        {projects.length} 件の案件を表示中
      </p>
    </div>
  );
}
