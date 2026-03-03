'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Plus, ArrowRightLeft, Pencil } from 'lucide-react';
import type { ActivityResponse } from '@/types/dashboard';

interface Props {
  data: ActivityResponse | undefined;
  isLoading?: boolean;
}

function getRelativeTime(timestamp: string): string {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  if (days < 7) return `${days}日前`;
  return new Date(timestamp).toLocaleDateString('ja-JP');
}

function ActivityIcon({ type }: { type: string }) {
  if (type === 'created') return <Plus className="h-3.5 w-3.5" />;
  if (type === 'status_change') return <ArrowRightLeft className="h-3.5 w-3.5" />;
  return <Pencil className="h-3.5 w-3.5" />;
}

function iconBg(type: string): string {
  if (type === 'created') return 'bg-green-100 text-green-600';
  if (type === 'status_change') return 'bg-blue-100 text-blue-600';
  return 'bg-gray-100 text-gray-600';
}

export const ActivityFeed = memo(function ActivityFeed({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">直近アクティビティ</h3>
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          読み込み中...
        </div>
      </div>
    );
  }

  if (data.activities.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-semibold mb-4">直近アクティビティ</h3>
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          アクティビティがありません
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold mb-4">直近アクティビティ</h3>

      <div className="space-y-3">
        {data.activities.map((item) => (
          <div key={item.id} className="flex items-start gap-3">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 ${iconBg(item.type)}`}>
              <ActivityIcon type={item.type} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/projects/${item.projectId}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {item.projectNo}
                </Link>
                <span className="text-sm text-muted-foreground truncate">
                  {item.customerName}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.description} — {item.userName}
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {getRelativeTime(item.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
