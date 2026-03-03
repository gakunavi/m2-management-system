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
  projectIsActive: boolean;
  updatedAt: string;
  business: { id: number; businessName: string } | null;
  customer: { id: number; customerCode: string; customerName: string } | null;
  partner: { id: number; partnerCode: string; partnerName: string } | null;
  projectAssignedUserName: string | null;
}

interface Props {
  entityId: number;
  /** 'customer' | 'partner' — フィルターに使う検索パラメータを決定 */
  filterBy: 'customer' | 'partner';
}

export function RelatedProjectsTab({ entityId, filterBy }: Props) {
  const queryKey = ['related-projects', filterBy, entityId];

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey,
    queryFn: async () => {
      const filterKey = filterBy === 'customer' ? 'customerId' : 'partnerId';
      const data = await apiClient.getList<Project>('/projects', {
        pageSize: 100,
        filters: {
          [filterKey]: String(entityId),
          isActive: 'true',
        },
      });
      return data.data ?? [];
    },
  });

  if (isLoading) return <LoadingSpinner />;

  if (projects.length === 0) {
    return (
      <EmptyState
        title="関連案件がありません"
        description="この顧客/代理店に紐づく案件がまだ登録されていません。"
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>案件番号</TableHead>
            <TableHead>事業</TableHead>
            {filterBy === 'partner' && <TableHead>顧客</TableHead>}
            {filterBy === 'customer' && <TableHead>代理店</TableHead>}
            <TableHead>営業ステータス</TableHead>
            <TableHead>受注予定月</TableHead>
            <TableHead>担当者</TableHead>
            <TableHead>更新日</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-1 font-mono text-sm font-medium text-primary hover:underline"
                >
                  {project.projectNo}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {project.business?.businessName ?? '-'}
              </TableCell>
              {filterBy === 'partner' && (
                <TableCell className="text-sm">
                  {project.customer
                    ? `${project.customer.customerName} (${project.customer.customerCode})`
                    : '-'}
                </TableCell>
              )}
              {filterBy === 'customer' && (
                <TableCell className="text-sm text-muted-foreground">
                  {project.partner?.partnerName ?? '-'}
                </TableCell>
              )}
              <TableCell>
                {project.projectSalesStatusLabel ? (
                  <Badge
                    variant="outline"
                    style={
                      project.projectSalesStatusColor
                        ? {
                            borderColor: project.projectSalesStatusColor,
                            color: project.projectSalesStatusColor,
                          }
                        : undefined
                    }
                    className="text-xs"
                  >
                    {project.projectSalesStatusLabel}
                  </Badge>
                ) : (
                  <span className="text-sm">{project.projectSalesStatus}</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {project.projectExpectedCloseMonth ?? '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {project.projectAssignedUserName ?? '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(project.updatedAt).toLocaleDateString('ja-JP')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
