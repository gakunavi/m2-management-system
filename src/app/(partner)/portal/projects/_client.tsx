'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBusiness } from '@/hooks/use-business';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/form/search-input';
import { SalesStatusFilter } from '@/components/features/project/sales-status-filter';
import { PortalProjectList } from '@/components/features/portal/portal-project-list';
import type { PortalProject, PortalFieldDefinition } from '@/types/dashboard';

interface StatusDef {
  statusCode: string;
  statusLabel: string;
  statusColor: string | null;
}

interface ProjectsResponse {
  data: PortalProject[];
  fieldDefinitions: PortalFieldDefinition[];
  statusDefinitions: StatusDef[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export function PortalProjectsClient() {
  const { selectedBusinessId } = useBusiness();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const projectParams = new URLSearchParams({
    page: String(page),
    sortBy,
    sortOrder,
  });
  if (selectedBusinessId) {
    projectParams.set('businessId', String(selectedBusinessId));
  }
  if (selectedStatuses.length > 0) {
    projectParams.set('statuses', selectedStatuses.join(','));
  }
  if (debouncedSearch) {
    projectParams.set('search', debouncedSearch);
  }

  const { data: projectsResponse, isLoading } = useQuery({
    queryKey: ['portal', 'projects', selectedBusinessId, page, sortBy, sortOrder, selectedStatuses, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/v1/portal/projects?${projectParams.toString()}`, {
        credentials: 'include',
      });
      const json = await res.json();
      return {
        data: json.data as PortalProject[],
        fieldDefinitions: (json.fieldDefinitions ?? []) as PortalFieldDefinition[],
        statusDefinitions: (json.statusDefinitions ?? []) as StatusDef[],
        meta: json.meta,
      } as ProjectsResponse;
    },
  });

  const statusDefinitions = projectsResponse?.statusDefinitions ?? [];

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleStatusChange = (statuses: string[]) => {
    setSelectedStatuses(statuses);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="案件一覧" />

      <div className="w-80">
        <SearchInput
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="顧客名・案件番号・担当者で検索..."
        />
      </div>

      {statusDefinitions.length > 0 && (
        <div className="bg-card rounded-lg border p-4">
          <SalesStatusFilter
            statusDefinitions={statusDefinitions}
            selectedStatuses={selectedStatuses}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}

      <PortalProjectList
        projects={projectsResponse?.data}
        meta={projectsResponse?.meta}
        fieldDefinitions={projectsResponse?.fieldDefinitions}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onPageChange={setPage}
        isLoading={isLoading}
      />
    </div>
  );
}
