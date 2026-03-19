'use client';

import { memo } from 'react';
import Link from 'next/link';
import { ListTodo, AlertTriangle, Clock, Calendar, ArrowRight, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskDashboard } from '@/hooks/use-tasks';
import { TASK_PRIORITY_OPTIONS } from '@/types/task';
import type { TaskListItem } from '@/types/task';
import type { TaskDashboardSection } from '@/hooks/use-tasks';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ============================================
// タスク行
// ============================================

function TaskRow({ task, highlight }: { task: TaskListItem; highlight?: 'overdue' | 'upcoming' }) {
  const priorityDef = TASK_PRIORITY_OPTIONS.find((p) => p.value === task.priority);
  const assignees = (task as unknown as { assignees?: { id: number; userName: string }[] }).assignees ?? [];
  const assigneeLabel = assignees.length === 0 ? '' : assignees.length === 1 ? assignees[0].userName : `${assignees[0].userName} +${assignees.length - 1}`;

  return (
    <Link
      href="/tasks"
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-muted/60',
        highlight === 'overdue' && 'bg-red-50/50',
      )}
    >
      <Circle
        className="h-2 w-2 flex-shrink-0"
        fill={priorityDef?.color ?? '#94a3b8'}
        stroke="none"
      />
      <span className={cn('flex-1 truncate', highlight === 'overdue' && 'text-red-700 font-medium')}>
        {task.title}
      </span>
      {assigneeLabel && (
        <span className="text-[11px] text-muted-foreground truncate max-w-[60px] hidden sm:inline">
          {assigneeLabel}
        </span>
      )}
      {task.dueDate && (
        <span className={cn(
          'text-[11px] flex-shrink-0',
          highlight === 'overdue' ? 'text-red-500 font-medium' : highlight === 'upcoming' ? 'text-orange-500 font-medium' : 'text-muted-foreground',
        )}>
          {formatDate(task.dueDate)}
        </span>
      )}
    </Link>
  );
}

// ============================================
// セクション
// ============================================

function DashboardSection({
  icon,
  label,
  section,
  highlight,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  section: TaskDashboardSection;
  highlight?: 'overdue' | 'upcoming';
  iconColor?: string;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={iconColor}>{icon}</span>
        <span className="text-sm font-medium flex-1">{label}</span>
        <span className={cn(
          'text-xs font-bold px-2 py-0.5 rounded-full',
          section.count > 0 && highlight === 'overdue' ? 'bg-red-100 text-red-700' :
          section.count > 0 ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground',
        )}>
          {section.count}
        </span>
      </div>

      <div className="border-t">
        {section.items.length > 0 ? (
          <div className="divide-y divide-border/50">
            {section.items.map((task) => (
              <TaskRow key={task.id} task={task} highlight={highlight} />
            ))}
            {section.count > section.items.length && (
              <Link
                href="/tasks"
                className="block px-3 py-2 text-xs text-center text-muted-foreground hover:text-foreground transition-colors"
              >
                他 {section.count - section.items.length} 件を表示 →
              </Link>
            )}
          </div>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground text-center">対象のタスクはありません</p>
        )}
      </div>
    </div>
  );
}

// ============================================
// メインウィジェット
// ============================================

export const TaskDashboardWidget = memo(function TaskDashboardWidget() {
  const { data, isLoading } = useTaskDashboard();

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ListTodo className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">マイタスク</h3>
        </div>
        <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-lg border bg-card p-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">マイタスク</h3>
        </div>
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          すべて表示
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* 統計カード */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 rounded-lg bg-gray-100 px-3 py-2.5 text-center">
          <p className="text-xl font-bold text-gray-700">{data.summary.todo}</p>
          <p className="text-[11px] font-medium text-gray-600 mt-0.5">未着手</p>
        </div>
        <div className="flex-1 rounded-lg bg-blue-50 px-3 py-2.5 text-center">
          <p className="text-xl font-bold text-blue-700">{data.summary.inProgress}</p>
          <p className="text-[11px] font-medium text-blue-600 mt-0.5">進行中</p>
        </div>
      </div>

      {/* 3セクション */}
      <div className="space-y-2">
        <DashboardSection
          icon={<Clock className="h-4 w-4" />}
          label="期限間近マイタスク"
          section={data.upcoming}
          highlight="upcoming"
          iconColor="text-orange-500"
        />
        <DashboardSection
          icon={<AlertTriangle className="h-4 w-4" />}
          label="期限超過マイタスク"
          section={data.overdue}
          highlight="overdue"
          iconColor="text-red-500"
        />
        <DashboardSection
          icon={<Calendar className="h-4 w-4" />}
          label="期限付きマイタスク"
          section={data.withDueDate}
          iconColor="text-muted-foreground"
        />
      </div>
    </div>
  );
});
