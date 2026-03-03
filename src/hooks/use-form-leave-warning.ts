'use client';

import { useEffect } from 'react';

/**
 * フォーム編集中のページ離脱時に警告を表示するフック。
 * ブラウザの beforeunload イベントでタブ/ウィンドウ閉じ・リロードを抑止する。
 *
 * @param isDirty - フォームに未保存の変更があるか
 * @param enabled - 警告を有効にするか（config.warnOnLeave 等）
 */
export function useFormLeaveWarning(isDirty: boolean, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || !isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 古いブラウザ互換
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, enabled]);
}
