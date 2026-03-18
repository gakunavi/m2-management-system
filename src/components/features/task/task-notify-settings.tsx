'use client';

import { X, Bell } from 'lucide-react';
import { TASK_NOTIFY_LEVEL_OPTIONS } from '@/types/task';

interface TaskNotifySettingsProps {
  notifyLevel: string;
  notifyTargetUserIds: number[];
  onNotifyLevelChange: (level: string) => void;
  onNotifyTargetsChange: (userIds: number[]) => void;
  /** 編集時: 既存の通知先ユーザー情報（名前付き） */
  existingTargets?: { userId: number; userName: string }[];
}

export function TaskNotifySettings({
  notifyLevel,
  notifyTargetUserIds,
  onNotifyLevelChange,
  onNotifyTargetsChange,
  existingTargets = [],
}: TaskNotifySettingsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
        <label className="text-sm font-medium">通知設定</label>
      </div>

      {/* 通知レベル */}
      <div className="flex items-center gap-2">
        {TASK_NOTIFY_LEVEL_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="notifyLevel"
              value={opt.value}
              checked={notifyLevel === opt.value}
              onChange={() => onNotifyLevelChange(opt.value)}
              className="accent-primary"
            />
            {opt.label}
          </label>
        ))}
      </div>

      {/* 通知先（notifyLevel が none でない場合のみ表示） */}
      {notifyLevel !== 'none' && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">通知先:</span>
          <div className="flex flex-wrap items-center gap-1">
            {existingTargets
              .filter((t) => notifyTargetUserIds.includes(t.userId))
              .map((t) => (
                <span
                  key={t.userId}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {t.userName}
                  <button onClick={() => onNotifyTargetsChange(notifyTargetUserIds.filter((id) => id !== t.userId))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            <span className="text-xs text-muted-foreground">
              （担当者は自動で追加されます）
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
