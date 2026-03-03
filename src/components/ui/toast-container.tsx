'use client';

import { useToastStore, type ToastType } from '@/hooks/use-toast';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styleMap: Record<ToastType, string> = {
  success: 'border-green-500 bg-green-50 text-green-800',
  error: 'border-destructive bg-destructive/10 text-destructive',
  warning: 'border-yellow-500 bg-yellow-50 text-yellow-800',
  info: 'border-blue-500 bg-blue-50 text-blue-800',
};

export function ToastContainer() {
  const { toasts, remove } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:w-96">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4 shadow-lg animate-in slide-in-from-right',
              styleMap[toast.type],
            )}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              {toast.title && <p className="font-semibold text-sm">{toast.title}</p>}
              <p className="text-sm">{toast.message}</p>
            </div>
            <button onClick={() => remove(toast.id)} className="shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
