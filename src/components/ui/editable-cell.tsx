'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CellEditor } from './cell-editor';
import type { CellEditConfig } from '@/types/config';

interface EditableCellProps {
  value: unknown;
  editConfig?: CellEditConfig;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  row: Record<string, unknown>;
  onCommit: (value: unknown) => Promise<void>;
  align?: 'left' | 'center' | 'right';
  /** true の場合、ダブルクリックで編集開始（リンク列用） */
  doubleClickToEdit?: boolean;
  /** doubleClickToEdit 時のシングルクリックアクション（例: ページ遷移） */
  onSingleClick?: () => void;
}

type CellState = 'display' | 'editing' | 'saving' | 'error';

/** ダブルクリック検出までの待機時間（ms） */
const DBLCLICK_DELAY = 250;

export function EditableCell({
  value,
  editConfig,
  render,
  row,
  onCommit,
  align,
  doubleClickToEdit,
  onSingleClick,
}: EditableCellProps) {
  const [state, setState] = useState<CellState>('display');
  const [localValue, setLocalValue] = useState<unknown>(value);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const originalValueRef = useRef<unknown>(value);
  const cellRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 外部からの value 変更を追跡（display 状態時のみ同期）
  const prevValueRef = useRef<unknown>(value);
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      if (state === 'display') {
        setLocalValue(value);
        originalValueRef.current = value;
      }
    }
  }, [value, state]);

  // アンマウント時にタイマーをクリア
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  // editing 状態でセル外クリック → キャンセル
  useEffect(() => {
    if (state !== 'editing') return;

    const handlePointerDown = (e: PointerEvent) => {
      const cell = cellRef.current;
      if (!cell) return;
      const target = e.target as Node;
      // セル内、または Radix ポータル（Select ドロップダウン）内のクリックは無視
      if (cell.contains(target)) return;
      // Radix の SelectContent はポータルにレンダーされるので data 属性で検知
      const portalEl = (target as Element).closest?.('[data-radix-popper-content-wrapper]');
      if (portalEl) return;
      // textarea の場合はセル外クリックで保存を試みる
      const textarea = cell.querySelector('textarea');
      if (textarea) {
        handleCommitRef.current(textarea.value);
        return;
      }
      // その他はキャンセル
      handleCancelRef.current();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [state]);

  const handleCommit = useCallback(
    async (newValue: unknown) => {
      if (newValue === originalValueRef.current) {
        setState('display');
        return;
      }

      // クライアントサイドバリデーション
      if (editConfig?.validate) {
        const result = editConfig.validate(newValue);
        if (!result.success) {
          setErrorMessage(result.error ?? 'エラー');
          setState('error');
          return;
        }
      }

      setState('saving');
      setLocalValue(newValue);
      setErrorMessage(null);

      try {
        await onCommit(newValue);
        originalValueRef.current = newValue;
        setState('display');
      } catch {
        // エラー時は元の値に戻す
        setLocalValue(originalValueRef.current);
        setState('error');
      }
    },
    [editConfig, onCommit],
  );

  // handleCommit を ref 経由で参照することで handleClick の循環依存を回避
  const handleCommitRef = useRef(handleCommit);
  handleCommitRef.current = handleCommit;

  const handleCancel = useCallback(() => {
    // saving 中はキャンセル不可（Select の onOpenChange と競合防止）
    setState((current) => {
      if (current !== 'editing') return current;
      setLocalValue(originalValueRef.current);
      setErrorMessage(null);
      return 'display';
    });
  }, []);

  const handleCancelRef = useRef(handleCancel);
  handleCancelRef.current = handleCancel;

  const isUrlType = editConfig?.type === 'url';
  const hasUrlValue = isUrlType && typeof localValue === 'string' && localValue !== '';

  const startEditing = useCallback(() => {
    if (!editConfig || state !== 'display') return;
    originalValueRef.current = localValue;
    setState('editing');
  }, [editConfig, state, localValue]);

  const handleClick = useCallback(() => {
    if (!editConfig || state !== 'display') return;
    // checkbox はクリックで即トグル
    if (editConfig.type === 'checkbox') {
      handleCommitRef.current(!localValue);
      return;
    }
    // URL 型: シングルクリックでリンクを開く（値がある場合）
    if (isUrlType) {
      if (hasUrlValue) {
        window.open(localValue as string, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    // ダブルクリック編集モード: シングルクリックは遅延実行（ダブルクリック検出のため）
    if (doubleClickToEdit) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        onSingleClick?.();
      }, DBLCLICK_DELAY);
      return;
    }
    startEditing();
  }, [editConfig, state, localValue, isUrlType, hasUrlValue, doubleClickToEdit, onSingleClick, startEditing]);

  // URL 型 または ダブルクリック編集モード: ダブルクリックで編集モードに入る
  const handleDoubleClick = useCallback(() => {
    if (state !== 'display' || !editConfig) return;
    if (!isUrlType && !doubleClickToEdit) return;
    // 遅延中のシングルクリックアクションをキャンセル
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    startEditing();
  }, [isUrlType, doubleClickToEdit, state, editConfig, startEditing]);

  const displayContent = render
    ? render(localValue, row)
    : localValue != null && localValue !== ''
    ? String(localValue)
    : '-';

  const isEditable = !!editConfig;
  const isDblClickEditable = doubleClickToEdit && isEditable;

  return (
    <div
      ref={cellRef}
      className={cn(
        'relative w-full h-full min-h-[32px] flex items-center',
        align === 'right' && 'justify-end',
        align === 'center' && 'justify-center',
        isEditable && state === 'display' && 'cursor-pointer hover:bg-blue-50',
        isEditable && state === 'display' && 'group',
        state === 'editing' && 'ring-2 ring-blue-500 ring-inset bg-white z-10',
        state === 'saving' && 'opacity-60',
        state === 'error' && 'ring-2 ring-destructive ring-inset',
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={
        state === 'error' && errorMessage
          ? errorMessage
          : hasUrlValue
          ? `${localValue}\n（ダブルクリックで編集）`
          : isDblClickEditable
          ? 'ダブルクリックで編集'
          : undefined
      }
    >
      {state === 'editing' && editConfig ? (
        <div className="w-full">
          <CellEditor
            config={editConfig}
            value={localValue}
            onCommit={handleCommit}
            onCancel={handleCancel}
          />
        </div>
      ) : (
        <span
          className={cn(
            'px-2 py-1 text-sm w-full truncate',
            state === 'error' && 'text-destructive',
            hasUrlValue && 'text-blue-600 underline decoration-blue-400/50',
            isDblClickEditable && 'text-primary hover:underline',
          )}
        >
          {hasUrlValue ? (
            <span className="flex items-center gap-1 min-w-0 w-full">
              <span className="truncate">{displayContent}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-blue-400" />
            </span>
          ) : (
            <>
              {displayContent}
              {state === 'error' && errorMessage && (
                <span className="ml-1 text-xs text-destructive">({errorMessage})</span>
              )}
            </>
          )}
        </span>
      )}

      {state === 'saving' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}
