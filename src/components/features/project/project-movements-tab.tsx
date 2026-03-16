'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Circle, Play, SkipForward, Link2 } from 'lucide-react';
import { MovementEditModal } from '@/components/features/project/movement-edit-modal';
import type { MovementData } from '@/components/features/project/movement-edit-modal';
import { GanttChart, type ViewMode } from '@/components/features/project/gantt-chart';
import { toGanttRowsForDetail } from '@/components/features/project/gantt-chart-utils';
import type { GanttBar } from '@/components/features/project/gantt-chart-utils';
import type { DetailMovement } from '@/types/movement';
import { Separator } from '@/components/ui/separator';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { MovementStatus } from '@/lib/validations/movement';

interface Props {
  entityId: number;
}

const STATUS_CONFIG: Record<MovementStatus, { label: string; bg: string; iconColor: string; icon: typeof CheckCircle }> = {
  pending:   { label: '未着手',     bg: 'bg-gray-50',   iconColor: 'text-gray-400',   icon: Circle },
  started:   { label: '進行中',     bg: 'bg-blue-50',   iconColor: 'text-blue-600',   icon: Play },
  completed: { label: '完了',       bg: 'bg-green-50',  iconColor: 'text-green-600',  icon: CheckCircle },
  skipped:   { label: 'スキップ',   bg: 'bg-yellow-50', iconColor: 'text-yellow-600', icon: SkipForward },
};

function formatCompactDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 連動フィールド値を表示用に変換 */
function formatLinkedFieldValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? '✓' : '-';
  return String(value);
}

/** Movement → MovementEditModal 用の MovementData に変換 */
function toMovementData(movement: DetailMovement): MovementData {
  return {
    id: movement.id,
    projectId: movement.projectId,
    movementStatus: movement.movementStatus,
    movementStartedAt: movement.movementStartedAt,
    movementCompletedAt: movement.movementCompletedAt,
    movementNotes: movement.movementNotes,
    stepNumber: movement.template.stepNumber,
    stepName: movement.template.stepName,
    stepDescription: movement.template.stepDescription,
    stepLinkedFieldKey: movement.template.stepLinkedFieldKey,
    linkedFieldValue: movement.linkedFieldValue,
    linkedFieldLabel: movement.template.linkedFieldLabel,
    linkedFieldType: movement.template.linkedFieldType,
    linkedFieldOptions: movement.template.linkedFieldOptions,
  };
}

export function ProjectMovementsTab({ entityId }: Props) {
  const { toast } = useToast();
  const [editingMovement, setEditingMovement] = useState<DetailMovement | null>(null);
  const [ganttViewMode, setGanttViewMode] = useState<ViewMode>('Day');

  const { data: movements, isLoading, error } = useQuery({
    queryKey: ['project-movements', entityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects/${entityId}/movements`);
      if (!res.ok) throw new Error('取得失敗');
      const json = await res.json() as { data: DetailMovement[] };
      return json.data;
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message="ムーブメントの取得に失敗しました" />;
  if (!movements || movements.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        この案件にはムーブメントが設定されていません
      </div>
    );
  }

  const minWidth = movements.length * 120;

  const handleGanttBarClick = (bar: GanttBar) => {
    const movement = movements.find((m) => m.id === bar.movementId);
    if (movement) setEditingMovement(movement);
  };

  return (
    <div className="space-y-3">
      {/* 凡例 */}
      <div className="flex flex-wrap gap-2 sm:gap-4 text-xs px-1">
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
        <span className="text-muted-foreground">セルをクリックして編集</span>
      </div>

      {/* マトリクス表 */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${minWidth}px` }}>
            {/* ヘッダー行 */}
            <div className="bg-muted/50 border-b flex">
              {movements.map((m) => (
                <div
                  key={m.id}
                  className="w-[120px] sm:w-[140px] shrink-0 px-2 py-3 border-r text-xs text-center font-medium"
                >
                  <div className="leading-tight">{m.template.stepName}</div>
                  {m.template.stepLinkedFieldKey && m.template.linkedFieldLabel && (
                    <div className="flex items-center justify-center gap-0.5 mt-1 text-muted-foreground">
                      <Link2 className="h-3 w-3" />
                      <span className="text-[10px]">{m.template.linkedFieldLabel}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* データ行 */}
            <div className="flex">
              {movements.map((movement) => {
                const config = STATUS_CONFIG[movement.movementStatus as MovementStatus] ?? STATUS_CONFIG.pending;
                const Icon = config.icon;

                return (
                  <div
                    key={movement.id}
                    className={cn(
                      'w-[120px] sm:w-[140px] shrink-0 px-2 py-4 border-r flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity',
                      config.bg,
                    )}
                    onClick={() => setEditingMovement(movement)}
                  >
                    <Icon className={cn('h-5 w-5 mb-1.5', config.iconColor)} />

                    {/* 進捗バー */}
                    <div className="w-full bg-gray-200 rounded-full h-1 mb-1.5">
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

                    {/* ステータスラベル */}
                    <span className={cn('text-xs font-medium mb-1', config.iconColor)}>
                      {config.label}
                    </span>

                    {/* 連動フィールド値 */}
                    {movement.template.linkedFieldLabel && formatLinkedFieldValue(movement.linkedFieldValue) && (
                      <div className="text-[10px] text-center text-purple-700 font-medium truncate w-full px-0.5 mb-0.5" title={`${movement.template.linkedFieldLabel}: ${formatLinkedFieldValue(movement.linkedFieldValue)}`}>
                        {formatLinkedFieldValue(movement.linkedFieldValue)}
                      </div>
                    )}

                    {/* 日付 */}
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
          </div>
        </div>
      </div>

      {/* ガントチャート（タイムライン） */}
      <Separator />
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">タイムライン</h3>
        <GanttChart
          rows={toGanttRowsForDetail(movements)}
          viewMode={ganttViewMode}
          onViewModeChange={setGanttViewMode}
          onBarClick={handleGanttBarClick}
          labelWidth={120}
        />
      </div>

      {/* 編集モーダル（共通コンポーネント使用） */}
      {editingMovement && (
        <MovementEditModal
          movement={toMovementData(editingMovement)}
          open
          onClose={() => setEditingMovement(null)}
          invalidateKeys={[
            ['project-movements', entityId],
            ['project', String(entityId)],
          ]}
          onSuccess={() => {
            toast({ message: 'ムーブメントを更新しました', type: 'success' });
          }}
          onError={(error) => {
            toast({ message: error.message, type: 'error' });
          }}
        />
      )}
    </div>
  );
}
