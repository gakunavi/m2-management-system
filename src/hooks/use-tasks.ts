'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { TaskListItem, TaskDetail, TaskTagItem } from '@/types/task';
import type { PaginationMeta } from '@/types/api';

// ============================================
// Query Keys
// ============================================

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (params: TaskListParams) => [...taskKeys.lists(), params] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: number) => [...taskKeys.details(), id] as const,
  tags: () => ['task-tags'] as const,
  tagSuggest: (q: string) => ['task-tags', 'suggest', q] as const,
};

// ============================================
// タスク一覧
// ============================================

export interface TaskListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  scope?: string;
  businessId?: number;
  status?: string;
  priority?: string;
  assigneeId?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  tagIds?: string;
  relatedEntityType?: string;
  relatedEntityId?: number;
  parentOnly?: boolean;
}

function buildTaskQueryString(params: TaskListParams): string {
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.pageSize) sp.set('pageSize', String(params.pageSize));
  if (params.search) sp.set('search', params.search);
  if (params.sort) sp.set('sort', params.sort);
  if (params.scope) sp.set('scope', params.scope);
  if (params.businessId) sp.set('businessId', String(params.businessId));
  if (params.status) sp.set('status', params.status);
  if (params.priority) sp.set('priority', params.priority);
  if (params.assigneeId) sp.set('assigneeId', String(params.assigneeId));
  if (params.dueDateFrom) sp.set('dueDateFrom', params.dueDateFrom);
  if (params.dueDateTo) sp.set('dueDateTo', params.dueDateTo);
  if (params.tagIds) sp.set('tagIds', params.tagIds);
  if (params.relatedEntityType) sp.set('relatedEntityType', params.relatedEntityType);
  if (params.relatedEntityId) sp.set('relatedEntityId', String(params.relatedEntityId));
  if (params.parentOnly) sp.set('parentOnly', 'true');
  return sp.toString();
}

export function useTaskList(params: TaskListParams) {
  const qs = buildTaskQueryString(params);
  const endpoint = `/tasks${qs ? `?${qs}` : ''}`;

  return useQuery<{ data: TaskListItem[]; meta: PaginationMeta }>({
    queryKey: taskKeys.list(params),
    queryFn: async () => {
      // apiClient.getList は { data, meta } を返す
      const result = await apiClient.getList<TaskListItem>(endpoint);
      return result;
    },
  });
}

// ============================================
// タスク詳細
// ============================================

export function useTaskDetail(id: number | null) {
  return useQuery<TaskDetail>({
    queryKey: taskKeys.detail(id!),
    queryFn: () => apiClient.get<TaskDetail>(`/tasks/${id}`),
    enabled: id != null,
    staleTime: 0,
  });
}

// ============================================
// タスク作成・更新・削除
// ============================================

export function useTaskMutations() {
  const queryClient = useQueryClient();

  const invalidateTasks = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === 'tasks';
      },
    });
  };

  const createTask = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.create<TaskDetail>('/tasks', data),
    onSuccess: invalidateTasks,
  });

  const updateTask = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) =>
      apiClient.patch<TaskDetail>(`/tasks/${id}`, data),
    onSuccess: invalidateTasks,
  });

  const deleteTask = useMutation({
    mutationFn: (id: number) =>
      apiClient.remove('/tasks', id),
    onSuccess: invalidateTasks,
  });

  const reorderTasks = useMutation({
    mutationFn: (items: { id: number; status: string; sortOrder: number }[]) =>
      apiClient.patch<void>('/tasks/reorder', { items }),
    onSuccess: invalidateTasks,
  });

  return { createTask, updateTask, deleteTask, reorderTasks };
}

// ============================================
// タグ
// ============================================

export function useTaskTags() {
  return useQuery<TaskTagItem[]>({
    queryKey: taskKeys.tags(),
    queryFn: () => apiClient.get<TaskTagItem[]>('/task-tags'),
  });
}

export function useTaskTagSuggest(query: string) {
  return useQuery<TaskTagItem[]>({
    queryKey: taskKeys.tagSuggest(query),
    queryFn: () => apiClient.get<TaskTagItem[]>(`/task-tags/suggest?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 1,
  });
}

export function useTaskTagMutations() {
  const queryClient = useQueryClient();

  const invalidateTags = () => {
    queryClient.invalidateQueries({ queryKey: taskKeys.tags() });
  };

  const createTag = useMutation({
    mutationFn: (data: { name: string; color: string; scope: string }) =>
      apiClient.create<TaskTagItem>('/task-tags', data),
    onSuccess: invalidateTags,
  });

  const updateTag = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; color?: string }) =>
      apiClient.patch<TaskTagItem>(`/task-tags/${id}`, data),
    onSuccess: invalidateTags,
  });

  const deleteTag = useMutation({
    mutationFn: (id: number) =>
      apiClient.remove('/task-tags', id),
    onSuccess: invalidateTags,
  });

  return { createTag, updateTag, deleteTag };
}
