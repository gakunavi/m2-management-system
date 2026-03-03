'use client';

import { create } from 'zustand';
import { useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: ToastItem[];
  add: (toast: ToastItem) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const MAX_TOASTS = 5;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => set((s) => {
    const next = [...s.toasts, toast];
    // 上限を超えた場合、古いものから削除
    return { toasts: next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next };
  }),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

let counter = 0;

export function useToast() {
  const { add, remove, clear } = useToastStore();

  const toast = useCallback(
    (options: { title?: string; message: string; type: ToastType; duration?: number }) => {
      const id = `toast-${++counter}`;
      add({ id, title: options.title, message: options.message, type: options.type });

      const duration = options.duration ?? 5000;
      if (duration > 0) {
        setTimeout(() => remove(id), duration);
      }
    },
    [add, remove],
  );

  return { toast, dismiss: remove, dismissAll: clear };
}
