'use client';

import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TASK_PRIORITY_OPTIONS } from '@/types/task';
import type { TaskListItem } from '@/types/task';
import { cn } from '@/lib/utils';

// ============================================
// Props
// ============================================

interface TaskCalendarViewProps {
  tasks: TaskListItem[];
  onTaskClick: (id: number) => void;
}

// ============================================
// useMediaQuery フック
// ============================================

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

// ============================================
// ローカル日付ヘルパー
// ============================================

/** 現在月を 'YYYY-MM' 形式で返す */
function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 'YYYY-MM' を受け取り、カレンダーグリッド用の日付配列を返す。
 * 月〜日始まり（ISO週）の7列グリッド。
 * グリッドは前月末・翌月頭のパディングを含む。
 */
function getMonthDays(yearMonth: string): { date: Date; isCurrentMonth: boolean }[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);

  // 月曜始まり: 0=月 ... 6=日
  // JS の getDay(): 0=日, 1=月, ..., 6=土
  const firstDow = (firstDay.getDay() + 6) % 7; // 月曜=0 になるよう変換
  const lastDow = (lastDay.getDay() + 6) % 7;

  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  // 前月パディング
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = new Date(y, m - 1, -i);
    days.push({ date: d, isCurrentMonth: false });
  }

  // 当月
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(y, m - 1, d), isCurrentMonth: true });
  }

  // 翌月パディング（6行 = 42マスになるよう埋める）
  const trailing = lastDow < 6 ? 6 - lastDow : 0;
  for (let d = 1; d <= trailing; d++) {
    days.push({ date: new Date(y, m, d), isCurrentMonth: false });
  }

  return days;
}

/**
 * 'YYYY-MM' を受け取り、delta ヶ月分ずらした 'YYYY-MM' を返す。
 * 年境界を正しく処理する。
 */
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

/** Date を 'YYYY-MM-DD' 形式のローカル文字列に変換 */
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** dueDate 文字列（ISO or YYYY-MM-DD）を 'YYYY-MM-DD' に正規化 */
function normalizeDueDate(dueDate: string): string {
  // ISO形式（例: 2025-03-25T00:00:00.000Z）の場合、ローカル日付部分を取得
  if (dueDate.includes('T')) {
    const d = new Date(dueDate);
    return toLocalDateStr(d);
  }
  return dueDate.slice(0, 10);
}

// ============================================
// 曜日ヘッダー設定
// ============================================

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;
const WEEKDAY_COLORS = [
  'text-foreground',
  'text-foreground',
  'text-foreground',
  'text-foreground',
  'text-foreground',
  'text-blue-500',
  'text-red-500',
] as const;

// ============================================
// 日セル内のタスクカード（コンパクト）
// ============================================

interface CalendarTaskCardProps {
  task: TaskListItem;
  onClick: () => void;
}

function CalendarTaskCard({ task, onClick }: CalendarTaskCardProps) {
  const priorityDef = TASK_PRIORITY_OPTIONS.find((p) => p.value === task.priority);
  const color = priorityDef?.color ?? '#94a3b8';

  return (
    <button
      type="button"
      className="w-full text-left rounded px-1 py-0.5 text-xs truncate flex items-center gap-1 hover:opacity-80 transition-opacity"
      style={{ backgroundColor: `${color}20`, borderLeft: `3px solid ${color}` }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{task.title}</span>
    </button>
  );
}

// ============================================
// 日セル
// ============================================

interface DayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasksForDay: TaskListItem[];
  onTaskClick: (id: number) => void;
  isMobile?: boolean;
  isSelected?: boolean;
  onDayClick?: () => void;
}

const MAX_TASKS_VISIBLE = 3;

function DayCell({ date, isCurrentMonth, isToday, tasksForDay, onTaskClick, isMobile, isSelected, onDayClick }: DayCellProps) {
  const dayNum = date.getDate();
  const visible = tasksForDay.slice(0, MAX_TASKS_VISIBLE);
  const overflow = tasksForDay.length - MAX_TASKS_VISIBLE;

  // 曜日インデックス（月曜=0）
  const dowIndex = (date.getDay() + 6) % 7;
  const isSaturday = dowIndex === 5;
  const isSunday = dowIndex === 6;

  if (isMobile) {
    return (
      <div
        className={cn(
          'min-h-[60px] border border-border p-1 flex flex-col items-center gap-0.5 cursor-pointer transition-colors',
          !isCurrentMonth && 'bg-muted/30',
          isToday && 'ring-2 ring-blue-400 ring-inset',
          isSelected && 'bg-accent',
        )}
        onClick={onDayClick}
      >
        {/* 日付番号 */}
        <div
          className={cn(
            'text-sm font-semibold leading-none w-7 h-7 flex items-center justify-center rounded-full',
            !isCurrentMonth && 'text-muted-foreground',
            isCurrentMonth && isSaturday && 'text-blue-500',
            isCurrentMonth && isSunday && 'text-red-500',
            isCurrentMonth && !isSaturday && !isSunday && 'text-foreground',
            isToday && 'bg-blue-500 text-white',
          )}
        >
          {dayNum}
        </div>

        {/* タスク数ドット */}
        {tasksForDay.length > 0 && (
          <div className="flex items-center gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {tasksForDay.length > 1 && (
              <span className="text-[10px] text-muted-foreground">{tasksForDay.length}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-h-[90px] border border-border p-1 flex flex-col gap-0.5',
        !isCurrentMonth && 'bg-muted/30',
        isToday && 'ring-2 ring-blue-400 ring-inset',
      )}
    >
      {/* 日付番号 */}
      <div
        className={cn(
          'text-xs font-semibold leading-none mb-0.5 w-5 h-5 flex items-center justify-center rounded-full',
          !isCurrentMonth && 'text-muted-foreground',
          isCurrentMonth && isSaturday && 'text-blue-500',
          isCurrentMonth && isSunday && 'text-red-500',
          isCurrentMonth && !isSaturday && !isSunday && 'text-foreground',
          isToday && 'bg-blue-500 text-white',
        )}
      >
        {dayNum}
      </div>

      {/* タスクカード */}
      {visible.map((task) => (
        <CalendarTaskCard
          key={task.id}
          task={task}
          onClick={() => onTaskClick(task.id)}
        />
      ))}

      {/* +N more */}
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground pl-1">+{overflow} 件</span>
      )}
    </div>
  );
}

// ============================================
// モバイル用 選択日のタスク一覧
// ============================================

function MobileDayTaskList({
  date,
  tasks,
  onTaskClick,
}: {
  date: Date;
  tasks: TaskListItem[];
  onTaskClick: (id: number) => void;
}) {
  const dayLabel = `${date.getMonth() + 1}月${date.getDate()}日`;

  return (
    <div className="border rounded-lg bg-background p-3 space-y-2">
      <p className="text-sm font-semibold">{dayLabel} のタスク</p>
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">タスクなし</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task) => {
            const priorityDef = TASK_PRIORITY_OPTIONS.find((p) => p.value === task.priority);
            const color = priorityDef?.color ?? '#94a3b8';
            return (
              <button
                key={task.id}
                type="button"
                className="w-full text-left rounded-lg px-3 py-2.5 text-sm flex items-center gap-2 hover:opacity-80 transition-opacity min-h-[44px] border"
                style={{ borderLeftWidth: '4px', borderLeftColor: color }}
                onClick={() => onTaskClick(task.id)}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="flex-1 truncate font-medium">{task.title}</span>
                {priorityDef && (
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {priorityDef.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// メインコンポーネント
// ============================================

export function TaskCalendarView({ tasks, onTaskClick }: TaskCalendarViewProps) {
  const todayStr = toLocalDateStr(new Date());
  const [currentYearMonth, setCurrentYearMonth] = useState(getCurrentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // 月変更時に選択日をクリア
  useEffect(() => {
    setSelectedDay(null);
  }, [currentYearMonth]);

  // 表示月ラベル（例: 2025年3月）
  const [y, m] = currentYearMonth.split('-').map(Number);
  const monthLabel = `${y}年${m}月`;

  // カレンダーグリッド日付
  const gridDays = useMemo(() => getMonthDays(currentYearMonth), [currentYearMonth]);

  // 親タスクのみ・dueDateあり → dateStr→tasks[] のマップ
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskListItem[]>();
    for (const task of tasks) {
      // サブタスクを除外
      if (task.parentTaskId !== null) continue;
      if (!task.dueDate) continue;
      const dateStr = normalizeDueDate(task.dueDate);
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(task);
    }
    return map;
  }, [tasks]);

  const isCurrentMonthNow = currentYearMonth === getCurrentMonth();

  // 選択日のタスク一覧（モバイル用）
  const selectedDayTasks = selectedDay ? (tasksByDate.get(selectedDay) ?? []) : [];
  const selectedDayDate = selectedDay ? (() => {
    const [sy, sm, sd] = selectedDay.split('-').map(Number);
    return new Date(sy, sm - 1, sd);
  })() : null;

  return (
    <div className="flex flex-col gap-3">
      {/* ナビゲーションバー */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="前月"
          className="p-2 sm:p-1.5 rounded hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
          onClick={() => setCurrentYearMonth((ym) => shiftMonth(ym, -1))}
        >
          <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4" />
        </button>

        <span className="text-sm font-semibold min-w-[90px] text-center">{monthLabel}</span>

        <button
          type="button"
          aria-label="翌月"
          className="p-2 sm:p-1.5 rounded hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
          onClick={() => setCurrentYearMonth((ym) => shiftMonth(ym, 1))}
        >
          <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
        </button>

        {!isCurrentMonthNow && (
          <button
            type="button"
            className="ml-2 text-xs px-3 py-2 sm:px-2 sm:py-1 rounded border hover:bg-accent transition-colors min-h-[44px] sm:min-h-0"
            onClick={() => setCurrentYearMonth(getCurrentMonth())}
          >
            今月
          </button>
        )}
      </div>

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 border-t border-l border-border">
        {/* 曜日ヘッダー */}
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn(
              'text-xs font-semibold text-center py-1.5 border-r border-b border-border bg-muted/40',
              WEEKDAY_COLORS[i],
            )}
          >
            {label}
          </div>
        ))}

        {/* 日セル */}
        {gridDays.map((day) => {
          const dateStr = toLocalDateStr(day.date);
          const tasksForDay = tasksByDate.get(dateStr) ?? [];
          return (
            <div key={dateStr} className="border-r border-b border-border">
              <DayCell
                date={day.date}
                isCurrentMonth={day.isCurrentMonth}
                isToday={dateStr === todayStr}
                tasksForDay={tasksForDay}
                onTaskClick={onTaskClick}
                isMobile={isMobile}
                isSelected={isMobile && selectedDay === dateStr}
                onDayClick={isMobile ? () => setSelectedDay(selectedDay === dateStr ? null : dateStr) : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* モバイル: 選択日のタスク一覧 */}
      {isMobile && selectedDay && selectedDayDate && (
        <MobileDayTaskList
          date={selectedDayDate}
          tasks={selectedDayTasks}
          onTaskClick={onTaskClick}
        />
      )}
    </div>
  );
}
