import type { Metadata } from 'next';
import { TasksClient } from './_client';

export const metadata: Metadata = { title: 'タスク管理' };

export default function TasksPage() {
  return <TasksClient />;
}
