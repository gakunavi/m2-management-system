'use client';

import { memo } from 'react';
import Link from 'next/link';
import { ListTodo, AlertTriangle, Calendar, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskDashboard } from '@/hooks/use-tasks';
import type { TaskListItem } from '@/types/task';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function TaskRow({ task, isOverdue }: { task: TaskListItem; isOverdue?: boolean }) {
  return (
    <Link
      href="/tasks"
      className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
    >
      <span className={cn('truncate', isOverdue && 'text-red-600')}>
        {task.taskNo} {task.title}
      </span>
      {task.dueDate && (
        <span className={cn('shrink-0 text-xs', isOverdue ? 'text-red-500' : 'text-muted-foreground')}>
          ({formatDate(task.dueDate)})
        </span>
      )}
    </Link>
  );
}

export const TaskDashboardWidget = memo(function TaskDashboardWidget() {
  const { data, isLoading } = useTaskDashboard();

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ListTodo className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">マイタスク</h3>
        </div>
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, upcoming, overdue } = data;
  const hasNoTasks = summary.total === 0 && overdue.length === 0 && upcoming.length === 0;

  return (
    <div className="rounded-lg border bg-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <ListTodo className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">マイタスク</h3>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          未着手 {summary.todo}
        </span>
        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
          進行中 {summary.inProgress}
        </span>
        {summary.overdue > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
            期限超過 {summary.overdue}
          </span>
        )}
      </div>

      {hasNoTasks ? (
        <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">
          タスクはありません
        </div>
      ) : (
        <div className="space-y-4">
          {/* Overdue section */}
          {overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-600">期限超過</span>
              </div>
              <div className="space-y-0.5">
                {overdue.map((task) => (
                  <TaskRow key={task.id} task={task} isOverdue />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming section */}
          {upcoming.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">今後7日</span>
              </div>
              <div className="space-y-0.5">
                {upcoming.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer link */}
      <div className="mt-4 pt-3 border-t">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          タスク管理を開く
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
});
