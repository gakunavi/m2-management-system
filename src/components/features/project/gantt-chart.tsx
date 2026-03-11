'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  type GanttRow,
  type GanttBar,
  type TimelineColumn,
  getDateRange,
  buildDayColumns,
  buildMonthColumns,
  buildWeekColumns,
  calcBarPosition,
  getBarColorClasses,
  getStatusLabel,
  formatDate,
} from './gantt-chart-utils';

export type ViewMode = 'Day' | 'Week' | 'Month';

interface GanttChartProps {
  rows: GanttRow[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBarClick?: (bar: GanttBar) => void;
  onRowLabelClick?: (row: GanttRow) => void;
  /** 行ラベルの幅 (px)。デフォルト 200 */
  labelWidth?: number;
}

const ROW_HEIGHT = 40;
const COL_WIDTH_DAY = 36;
const COL_WIDTH_WEEK = 80;
const COL_WIDTH_MONTH = 120;

export function GanttChart({
  rows,
  viewMode,
  onViewModeChange,
  onBarClick,
  onRowLabelClick,
  labelWidth = 200,
}: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredBar, setHoveredBar] = useState<GanttBar | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // タイムラインの範囲とカラム
  const { minDate, maxDate } = useMemo(() => getDateRange(rows), [rows]);
  const columns: TimelineColumn[] = useMemo(() => {
    switch (viewMode) {
      case 'Day':   return buildDayColumns(minDate, maxDate);
      case 'Week':  return buildWeekColumns(minDate, maxDate);
      case 'Month': return buildMonthColumns(minDate, maxDate);
    }
  }, [viewMode, minDate, maxDate]);

  const colWidth = viewMode === 'Day' ? COL_WIDTH_DAY : viewMode === 'Week' ? COL_WIDTH_WEEK : COL_WIDTH_MONTH;
  const timelineWidth = columns.length * colWidth;

  // カラムの実際の開始・終了日（週/月はスナップされるため minDate/maxDate と異なる）
  const timelineStart = columns.length > 0 ? columns[0].startDate : minDate;
  const timelineEnd = columns.length > 0 ? columns[columns.length - 1].endDate : maxDate;

  // 今日線の位置
  const todayPos = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const totalMs = timelineEnd.getTime() - timelineStart.getTime();
    if (totalMs <= 0) return null;
    const pct = ((now.getTime() - timelineStart.getTime()) / totalMs) * 100;
    if (pct < 0 || pct > 100) return null;
    return pct;
  }, [timelineStart, timelineEnd]);

  // 初期表示・ビューモード変更時に今日付近へスクロール
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || todayPos === null) return;
    const scrollTarget = (todayPos / 100) * timelineWidth - el.clientWidth / 3;
    el.scrollLeft = Math.max(0, scrollTarget);
  }, [todayPos, timelineWidth, viewMode]);

  // バーがない行の表示
  const hasAnyBars = rows.some((r) => r.bars.length > 0);

  if (!hasAnyBars) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        表示できるタイムラインデータがありません（全ステップが未着手）
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ヘッダー: 凡例 + ビューモード切替 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span>完了</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span>進行中</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border border-dashed border-gray-400 bg-gray-100" />
            <span>スキップ</span>
          </div>
          {rows.some((r) => r.expectedCloseMonth) && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0 border-t-2 border-dashed border-orange-400" />
              <span>受注予定月</span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'Day' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('Day')}
          >
            日
          </Button>
          <Button
            variant={viewMode === 'Week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('Week')}
          >
            週
          </Button>
          <Button
            variant={viewMode === 'Month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('Month')}
          >
            月
          </Button>
        </div>
      </div>

      {/* チャート本体 */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="flex">
          {/* 左側ラベル列（固定） */}
          <div
            className="flex-shrink-0 border-r bg-white z-10"
            style={{ width: labelWidth }}
          >
            {/* ヘッダー余白 */}
            <div className="h-10 border-b bg-muted/50 flex items-center px-3">
              <span className="text-xs font-medium text-muted-foreground">
                {onRowLabelClick ? '案件' : 'ステップ'}
              </span>
            </div>
            {/* 行ラベル */}
            {rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  'flex flex-col justify-center px-3 border-b truncate',
                  onRowLabelClick && 'cursor-pointer hover:bg-accent/50 transition-colors',
                )}
                style={{ height: ROW_HEIGHT }}
                onClick={() => onRowLabelClick?.(row)}
              >
                <span className="text-sm font-medium truncate">{row.label}</span>
                {row.subLabel && (
                  <span className="text-[10px] text-muted-foreground truncate">
                    {row.subLabel}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* タイムライン部分（横スクロール） */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto">
            <div style={{ width: timelineWidth, minWidth: '100%' }}>
              {/* タイムラインヘッダー */}
              <div className="h-10 border-b bg-muted/50 flex relative">
                {columns.map((col, i) => {
                  const isWeekend = viewMode === 'Day' &&
                    (col.startDate.getDay() === 0 || col.startDate.getDay() === 6);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex-shrink-0 flex items-center justify-center border-r',
                        viewMode === 'Day' ? 'text-[10px]' : 'text-xs',
                        isWeekend ? 'text-red-400 bg-red-50/50' : 'text-muted-foreground',
                      )}
                      style={{ width: colWidth }}
                    >
                      {col.label}
                    </div>
                  );
                })}
              </div>

              {/* バー描画エリア */}
              <div className="relative">
                {/* 縦のグリッド線 */}
                {columns.map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-r border-gray-100"
                    style={{ left: i * colWidth }}
                  />
                ))}

                {/* 今日線 */}
                {todayPos !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400 z-20"
                    style={{ left: `${todayPos}%` }}
                  >
                    <div className="absolute -top-0 left-1/2 -translate-x-1/2 bg-red-400 text-white text-[9px] px-1 rounded-b">
                      今日
                    </div>
                  </div>
                )}

                {/* 各行 */}
                {rows.map((row, rowIdx) => (
                  <div
                    key={row.id}
                    className={cn(
                      'relative border-b',
                      rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                    )}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {row.bars.map((bar) => {
                      const pos = calcBarPosition(bar, timelineStart, timelineEnd);
                      if (!pos) return null;

                      return (
                        <div
                          key={bar.id}
                          className={cn(
                            'absolute top-2 rounded cursor-pointer transition-all hover:brightness-90 hover:shadow-sm',
                            getBarColorClasses(bar.status),
                          )}
                          style={{
                            left: `${pos.leftPercent}%`,
                            width: `${pos.widthPercent}%`,
                            height: ROW_HEIGHT - 16,
                            minWidth: 4,
                          }}
                          onClick={() => onBarClick?.(bar)}
                          onMouseEnter={(e) => {
                            setHoveredBar(bar);
                            setTooltipPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => setHoveredBar(null)}
                        >
                          {/* バー内にラベルが入る場合 */}
                          {pos.widthPercent > 8 && (
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-medium truncate">
                              {bar.stepName}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* 受注予定月の目標線 */}
                    {row.expectedCloseMonth && (() => {
                      const [y, m] = row.expectedCloseMonth.split('-').map(Number);
                      // 月末日を算出
                      const closeDate = new Date(y, m, 0);
                      const totalMs = timelineEnd.getTime() - timelineStart.getTime();
                      if (totalMs <= 0) return null;
                      const pct = ((closeDate.getTime() - timelineStart.getTime()) / totalMs) * 100;
                      if (pct < 0 || pct > 100) return null;
                      return (
                        <div
                          className="absolute top-0 bottom-0 w-px border-l-2 border-dashed border-orange-400 z-10"
                          style={{ left: `${pct}%` }}
                        />
                      );
                    })()}

                    {/* バーがない行（全部 pending） */}
                    {row.bars.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground">未着手</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ツールチップ（ポータル的に fixed で表示） */}
      {hoveredBar && (
        <div
          className="fixed z-50 bg-white border rounded-lg shadow-lg px-3 py-2 pointer-events-none text-sm"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 10,
          }}
        >
          <p className="font-medium">{hoveredBar.stepName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hoveredBar.startDate ? formatDate(hoveredBar.startDate) : '-'}
            {' 〜 '}
            {hoveredBar.endDate ? formatDate(hoveredBar.endDate) : '(進行中)'}
          </p>
          <p className="text-xs mt-0.5">{getStatusLabel(hoveredBar.status)}</p>
        </div>
      )}
    </div>
  );
}
