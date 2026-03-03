'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useToast } from '@/hooks/use-toast';
import type { BatchActionDef } from '@/types/config';

interface BatchActionBarProps {
  selectedIds: number[];
  actions: BatchActionDef[];
  onClearSelection: () => void;
  onComplete: () => void;
  /** 現在のユーザーロール（権限チェック用） */
  userRole?: string;
}

export function BatchActionBar({
  selectedIds,
  actions,
  onClearSelection,
  onComplete,
  userRole,
}: BatchActionBarProps) {
  const { toast } = useToast();
  const [pendingAction, setPendingAction] = useState<BatchActionDef | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingKey, setExecutingKey] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  // 権限フィルター
  const visibleActions = actions.filter((action) => {
    if (!action.requiredRole || action.requiredRole.length === 0) return true;
    return userRole && action.requiredRole.includes(userRole);
  });

  const handleAction = (action: BatchActionDef) => {
    if (action.confirm) {
      setPendingAction(action);
    } else {
      executeAction(action);
    }
  };

  const executeAction = async (action: BatchActionDef) => {
    setIsExecuting(true);
    setExecutingKey(action.key);
    try {
      const response = await fetch(`/api/v1${action.apiEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: selectedIds, action: action.key }),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error?.message ?? '一括操作に失敗しました');
      }

      const affected = json?.data?.affected ?? selectedIds.length;
      const requested = selectedIds.length;

      toast({
        title: `${action.label} 完了`,
        message: affected === requested
          ? `${affected}件を処理しました`
          : `${requested}件中 ${affected}件を処理しました（${requested - affected}件はスキップ）`,
        type: 'success',
      });

      onClearSelection();
      if (action.onComplete !== 'redirect') {
        onComplete();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '一括操作に失敗しました';
      toast({ title: 'エラー', message, type: 'error' });
    } finally {
      setIsExecuting(false);
      setExecutingKey(null);
      setPendingAction(null);
    }
  };

  const confirmMessage =
    pendingAction?.confirm?.message
      ? typeof pendingAction.confirm.message === 'function'
        ? pendingAction.confirm.message(selectedIds.length)
        : pendingAction.confirm.message
      : '';

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border bg-primary/5 px-4 py-2 text-sm">
        <span className="font-medium text-primary">
          {selectedIds.length}件を選択中
        </span>
        <div className="flex items-center gap-2">
          {visibleActions.map((action) => (
            <Button
              key={action.key}
              variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => handleAction(action)}
              disabled={isExecuting}
            >
              {isExecuting && executingKey === action.key ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {action.label}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="ml-auto h-7 text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 h-3.5 w-3.5" />
          選択解除
        </Button>
      </div>

      {/* 確認ダイアログ */}
      <ConfirmModal
        open={pendingAction !== null}
        onOpenChange={(open: boolean) => { if (!open) setPendingAction(null); }}
        title={pendingAction?.confirm?.title ?? pendingAction?.label ?? '確認'}
        description={confirmMessage}
        confirmLabel="実行"
        variant={pendingAction?.variant === 'destructive' ? 'destructive' : 'default'}
        onConfirm={() => { if (pendingAction) executeAction(pendingAction); }}
        isLoading={isExecuting}
      />
    </>
  );
}
