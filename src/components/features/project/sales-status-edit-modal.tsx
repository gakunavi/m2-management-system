'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StatusDef } from '@/types/movement';

interface ProjectData {
  id: number;
  projectNo: string;
  customerName: string | null;
  projectSalesStatus: string;
  version: number;
}

interface Props {
  project: ProjectData;
  statusDefinitions: StatusDef[];
  open: boolean;
  onClose: () => void;
}

export function SalesStatusEditModal({ project, statusDefinitions, open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState(project.projectSalesStatus);

  const mutation = useMutation({
    mutationFn: async (statusCode: string) => {
      const res = await fetch(`/api/v1/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSalesStatus: statusCode,
          version: project.version,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? '営業ステータスの更新に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-movements-overview'] });
      onClose();
    },
  });

  const handleSave = () => {
    mutation.mutate(selectedStatus);
  };

  const hasChanged = selectedStatus !== project.projectSalesStatus;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>営業ステータス変更</DialogTitle>
          <DialogDescription>
            {project.customerName ?? project.projectNo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <span className="text-sm font-medium leading-none">営業ステータス</span>
          <div className="space-y-1">
            {statusDefinitions.map((sd) => {
              const isActive = selectedStatus === sd.statusCode;
              return (
                <button
                  key={sd.statusCode}
                  type="button"
                  onClick={() => setSelectedStatus(sd.statusCode)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 rounded-md border text-sm font-medium transition-all text-left',
                    isActive
                      ? 'text-white border-transparent'
                      : 'border-border bg-background hover:bg-muted',
                  )}
                  style={
                    isActive && sd.statusColor
                      ? { backgroundColor: sd.statusColor }
                      : isActive
                        ? { backgroundColor: '#6B7280' }
                        : undefined
                  }
                >
                  {!isActive && sd.statusColor && (
                    <span
                      className="inline-block w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: sd.statusColor }}
                    />
                  )}
                  {sd.statusLabel}
                  {isActive && <span className="ml-auto">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

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
