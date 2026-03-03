'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient } from '@/lib/api-client';

interface Project {
  id: number;
  projectNo: string;
  projectSalesStatus: string;
  projectSalesStatusLabel: string | null;
  projectSalesStatusColor: string | null;
  projectExpectedCloseMonth: string | null;
  updatedAt: string;
  partner: { id: number; partnerCode: string; partnerName: string } | null;
  projectAssignedUserName: string | null;
}

interface Props {
  entityId: number;
}

export function ProjectOtherProjectsTab({ entityId }: Props) {
  // プロジェクトデータ（キャッシュヒット）
  const { data: project } = useQuery<Record<string, unknown>>({
    queryKey: ['project', String(entityId)],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects/${entityId}`);
      if (!res.ok) throw new Error('取得失敗');
      const json = await res.json() as { data: Record<string, unknown> };
      return json.data;
    },
  });

  const customerId = project?.customerId as number | undefined;
  const businessId = project?.businessId as number | undefined;

  // 同一顧客 × 同一事業の案件一覧
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['other-projects', entityId, customerId, businessId],
    queryFn: async () => {
      const data = await apiClient.getList<Project>(
        `/projects?businessId=${businessId}`,
        {
          pageSize: 100,
          filters: {
            customerId: String(customerId),
            isActive: 'true',
          },
        },
      );
      // 自分自身を除外
      return (data.data ?? []).filter((p) => p.id !== entityId);
    },
    enabled: !!customerId && !!businessId,
  });

  if (!project || isLoading) return <LoadingSpinner />;

  if (projects.length === 0) {
    return <EmptyState title="その他案件はありません" />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>案件番号</TableHead>
            <TableHead>代理店</TableHead>
            <TableHead>営業ステータス</TableHead>
            <TableHead>受注予定月</TableHead>
            <TableHead>担当者</TableHead>
            <TableHead>更新日</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link
                  href={`/projects/${p.id}?from=/projects/${entityId},案件詳細`}
                  className="flex items-center gap-1 font-mono text-sm font-medium text-primary hover:underline"
                >
                  {p.projectNo}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {p.partner?.partnerName ?? '-'}
              </TableCell>
              <TableCell>
                {p.projectSalesStatusLabel ? (
                  <Badge
                    variant="outline"
                    style={
                      p.projectSalesStatusColor
                        ? {
                            borderColor: p.projectSalesStatusColor,
                            color: p.projectSalesStatusColor,
                          }
                        : undefined
                    }
                    className="text-xs"
                  >
                    {p.projectSalesStatusLabel}
                  </Badge>
                ) : (
                  <span className="text-sm">{p.projectSalesStatus}</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {p.projectExpectedCloseMonth ?? '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {p.projectAssignedUserName ?? '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(p.updatedAt).toLocaleDateString('ja-JP')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
