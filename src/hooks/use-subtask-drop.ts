'use client';

import { useRef, useCallback, useState } from 'react';
import type { TaskListItem } from '@/types/task';

/**
 * サブタスク化D&Dフック
 *
 * ドラッグ中に別タスクの上に1.5秒以上ホバーすると
 * 「サブタスク化モード」に切り替わる。
 *
 * バリデーション:
 * - 2階層制限（親→子のみ、孫タスクは不可）
 * - 自己参照防止（自分自身の上にドロップ不可）
 * - サブタスクを持つタスクはサブタスク化不可
 * - 既に親を持つタスク（サブタスク）は再ネスト不可
 */

const HOVER_THRESHOLD_MS = 1500;

export interface SubtaskDropState {
  /** サブタスク化モードが有効か */
  isSubtaskMode: boolean;
  /** サブタスク化先のタスクID（ドロップ先） */
  targetTaskId: number | null;
  /** ドラッグ中のタスクID */
  draggingTaskId: number | null;
}

/**
 * ドラッグ中のタスクがドロップ先タスクのサブタスクになれるか検証
 */
export function canBecomeSubtask(
  dragging: TaskListItem | null | undefined,
  target: TaskListItem | null | undefined,
): boolean {
  if (!dragging || !target) return false;
  // 自己参照防止
  if (dragging.id === target.id) return false;
  // ドラッグ元が既にサブタスクを持つ → サブタスク化不可（孫タスク防止）
  if (dragging.childrenCount > 0) return false;
  // ドラッグ元が既にサブタスク → 再ネスト不可
  if (dragging.parentTaskId != null) return false;
  // ドロップ先が既にサブタスク → 2階層制限
  if (target.parentTaskId != null) return false;
  return true;
}

/**
 * サブタスクから通常タスクに戻せるか検証
 */
export function canDetachSubtask(
  task: TaskListItem | null | undefined,
): boolean {
  if (!task) return false;
  return task.parentTaskId != null;
}

export function useSubtaskDrop() {
  const [state, setState] = useState<SubtaskDropState>({
    isSubtaskMode: false,
    targetTaskId: null,
    draggingTaskId: null,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringOverRef = useRef<number | null>(null);
  const draggingIdRef = useRef<number | null>(null);

  /** ドラッグ開始時に呼ぶ */
  const onDragStart = useCallback((taskId: number) => {
    draggingIdRef.current = taskId;
    setState({ isSubtaskMode: false, targetTaskId: null, draggingTaskId: taskId });
  }, []);

  /**
   * ドラッグ中にタスクの上にいる間、繰り返し呼ばれる。
   * 同じタスクの上に1.5秒以上いるとサブタスク化モードに切り替わる。
   *
   * @param overTaskId ホバー中のタスクID（nullならタスク上にいない）
   * @param draggingTask ドラッグ中のタスク情報
   * @param overTask ホバー中のタスク情報
   */
  const onHoverTask = useCallback((
    overTaskId: number | null,
    draggingTask: TaskListItem | null | undefined,
    overTask: TaskListItem | null | undefined,
  ) => {
    // ホバー先が変わった or タスク上にいない → タイマーリセット
    if (overTaskId !== hoveringOverRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      hoveringOverRef.current = overTaskId;

      // サブタスク化モードを解除
      setState((prev) => {
        if (prev.isSubtaskMode) {
          return { ...prev, isSubtaskMode: false, targetTaskId: null };
        }
        return prev;
      });

      // バリデーション通過時のみタイマー開始
      if (overTaskId != null && canBecomeSubtask(draggingTask, overTask)) {
        timerRef.current = setTimeout(() => {
          setState({
            isSubtaskMode: true,
            targetTaskId: overTaskId,
            draggingTaskId: draggingIdRef.current,
          });
        }, HOVER_THRESHOLD_MS);
      }
    }
  }, []);

  /** ドラッグ終了/キャンセル時にリセット */
  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    hoveringOverRef.current = null;
    draggingIdRef.current = null;
    setState({ isSubtaskMode: false, targetTaskId: null, draggingTaskId: null });
  }, []);

  return {
    state,
    onDragStart,
    onHoverTask,
    reset,
  };
}
