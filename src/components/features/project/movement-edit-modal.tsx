'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Circle, Play, CheckCircle, SkipForward, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { MovementStatus } from '@/lib/validations/movement';

export interface MovementData {
  id: number;
  projectId: number;
  movementStatus: MovementStatus;
  movementStartedAt: string | null;
  movementCompletedAt: string | null;
  movementNotes?: string | null;
  stepNumber: number;
  stepName: string;
  stepDescription?: string | null;
  stepIsSalesLinked?: boolean;
  stepLinkedStatusCode?: string | null;
}

interface Props {
  movement: MovementData;
  open: boolean;
  onClose: () => void;
  /** 追加で invalidate するクエリキー */
  invalidateKeys?: unknown[][];
  /** 成功時コールバック（toast通知等） */
  onSuccess?: (result: { statusLinked?: { label: string } }) => void;
  /** エラー時コールバック */
  onError?: (error: Error) => void;
}

const STATUS_OPTIONS: { value: MovementStatus; label: string; icon: typeof Circle; color: string; activeClass: string }[] = [
  { value: 'pending',   label: '未着手', icon: Circle,      color: 'text-gray-500',   activeClass: 'bg-gray-600 text-white border-gray-600' },
  { value: 'started',   label: '進行中', icon: Play,        color: 'text-blue-600',   activeClass: 'bg-blue-600 text-white border-blue-600' },
  { value: 'completed', label: '完了',   icon: CheckCircle, color: 'text-green-600',  activeClass: 'bg-green-600 text-white border-green-600' },
  { value: 'skipped',   label: 'スキップ', icon: SkipForward, color: 'text-yellow-600', activeClass: 'bg-yellow-600 text-white border-yellow-600' },
];

/** ISO文字列 → YYYY-MM-DD（date input用） */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.split('T')[0];
}

export function MovementEditModal({
  movement,
  open,
  onClose,
  invalidateKeys,
  onSuccess,
  onError,
}: Props) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MovementStatus>(movement.movementStatus);
  const [startDate, setStartDate] = useState(toDateInput(movement.movementStartedAt));
  const [endDate, setEndDate] = useState(toDateInput(movement.movementCompletedAt));
  const [notes, setNotes] = useState(movement.movementNotes ?? '');

  // ステータス変更時に日付を自動設定
  const handleStatusChange = (newStatus: MovementStatus) => {
    setStatus(newStatus);
    const today = new Date().toISOString().split('T')[0];

    switch (newStatus) {
      case 'started':
        if (!startDate) setStartDate(today);
        setEndDate('');
        break;
      case 'completed':
        if (!startDate) setStartDate(today);
        if (!endDate) setEndDate(today);
        break;
      case 'pending':
        setStartDate('');
        setEndDate('');
        break;
      case 'skipped':
        setEndDate('');
        break;
    }
  };

  const mutation = useMutation({
    mutationFn: async (payload: {
      movementStatus: MovementStatus;
      movementNotes: string | null;
      movementStartedAt: string | null;
      movementCompletedAt: string | null;
    }) => {
      const res = await fetch(`/api/v1/projects/${movement.projectId}/movements/${movement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'ムーブメントの更新に失敗しました');
      }
      return res.json();
    },
    onSuccess: (result) => {
      // デフォルトで overview キーを invalidate
      queryClient.invalidateQueries({ queryKey: ['project-movements-overview'] });
      // 追加キーを invalidate
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      onSuccess?.(result);
      onClose();
    },
    onError: (error: Error) => {
      onError?.(error);
    },
  });

  const handleSave = () => {
    mutation.mutate({
      movementStatus: status,
      movementNotes: notes.trim() || null,
      movementStartedAt: startDate || null,
      movementCompletedAt: endDate || null,
    });
  };

  const origStartDate = toDateInput(movement.movementStartedAt);
  const origEndDate = toDateInput(movement.movementCompletedAt);
  const hasChanged =
    status !== movement.movementStatus ||
    startDate !== origStartDate ||
    endDate !== origEndDate ||
    (notes.trim() || null) !== (movement.movementNotes ?? null);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            ステップ{movement.stepNumber}: {movement.stepName}
          </DialogTitle>
          <DialogDescription>
            {movement.stepDescription || 'ステータスを変更して保存してください'}
          </DialogDescription>
        </DialogHeader>

        {movement.stepIsSalesLinked && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded">
            <Link2 className="h-3 w-3" />
            完了時に営業ステータスを「{movement.stepLinkedStatusCode}」に連動
          </div>
        )}

        {/* ステータス選択 */}
        <div className="space-y-2">
          <span className="text-sm font-medium leading-none">ステータス</span>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all',
                    isActive
                      ? opt.activeClass
                      : 'border-border bg-background hover:bg-muted',
                  )}
                >
                  <Icon className={cn('h-4 w-4', isActive ? 'text-current' : opt.color)} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 日付入力 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-1">
            <Label htmlFor="mv-startDate">開始日</Label>
            <Input
              id="mv-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mv-endDate">完了日</Label>
            <Input
              id="mv-endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* メモ */}
        <div className="space-y-2">
          <span className="text-sm font-medium leading-none">メモ</span>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="メモを入力してください"
            rows={3}
          />
        </div>

        {/* エラー */}
        {mutation.isError && (
          <p className="text-sm text-destructive">
            {(mutation.error as Error).message}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending || !hasChanged}>
            {mutation.isPending ? '更新中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
