'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { taskKeys } from './use-tasks';

export function useTaskAttachments(taskId: number | null) {
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!taskId) throw new Error('taskId is required');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/v1/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      if (taskId != null) {
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (attachmentId: number) => {
      if (!taskId) throw new Error('taskId is required');
      const res = await fetch(`/api/v1/tasks/${taskId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Delete failed');
      }
    },
    onSuccess: () => {
      if (taskId != null) {
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      }
    },
  });

  return { upload, remove };
}
