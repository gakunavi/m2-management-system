'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, MessageSquare } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';

// --- Types ---

export type InquiryStatus = 'new' | 'in_progress' | 'resolved' | 'converted_to_qa';

export interface Inquiry {
  id: number;
  inquirySubject: string;
  inquiryBody: string;
  inquiryStatus: InquiryStatus;
  inquiryBusinessId: number | null;
  inquiryCategoryId: number | null;
  inquiryProjectId: number | null;
  inquiryAssignedUserId: number | null;
  inquiryResponse: string | null;
  inquiryRespondedAt: string | null;
  inquiryRespondedBy: number | null;
  inquiryIsConvertedToQa: boolean;
  inquiryConvertedQaId: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: number;
  business: { id: number; businessName: string } | null;
  category: { categoryName: string } | null;
  creator: { id: number; userName: string };
  assignedUser: { id: number; userName: string } | null;
  attachmentCount: number;
}

export interface QaCategory {
  id: number;
  categoryName: string;
}

// --- Status helpers ---

const STATUS_CONFIG: Record<InquiryStatus, { label: string; className: string }> = {
  new: { label: '新規', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  in_progress: { label: '対応中', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  resolved: { label: '解決済み', className: 'bg-green-100 text-green-800 border-green-200' },
  converted_to_qa: { label: 'QA変換済', className: 'bg-purple-100 text-purple-800 border-purple-200' },
};

export function InquiryStatusBadge({
  status,
  size = 'sm',
}: {
  status: InquiryStatus;
  size?: 'sm' | 'lg';
}) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' };
  return (
    <Badge
      variant="outline"
      className={`${config.className} ${size === 'lg' ? 'px-3 py-1 text-sm' : 'text-xs'}`}
    >
      {config.label}
    </Badge>
  );
}

// --- Fetch helpers ---

async function fetchInquiries(params: {
  status?: string;
  businessId?: string;
  categoryId?: string;
  search?: string;
  assignedUserId?: string;
}): Promise<Inquiry[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.businessId) qs.set('businessId', params.businessId);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.search) qs.set('search', params.search);
  if (params.assignedUserId) qs.set('assignedUserId', params.assignedUserId);

  const url = `/api/v1/inquiries${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('問い合わせの取得に失敗しました');
  const json = await res.json();
  return json.data as Inquiry[];
}

async function fetchQaCategories(): Promise<QaCategory[]> {
  const res = await fetch('/api/v1/qa/categories');
  if (!res.ok) throw new Error('カテゴリの取得に失敗しました');
  const json = await res.json();
  return json.data as QaCategory[];
}

// --- Debounce hook ---

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// --- Main component ---

export function InquiriesClient() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const { selectedBusinessId } = useBusiness();
  const isInternalUser = hasRole(['admin', 'staff']);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');

  const debouncedSearch = useDebounce(searchInput, 400);

  const { data: inquiries, isLoading } = useQuery({
    queryKey: ['inquiries', selectedBusinessId, statusFilter, categoryFilter, debouncedSearch, assignedFilter],
    queryFn: () =>
      fetchInquiries({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        businessId: selectedBusinessId ? String(selectedBusinessId) : undefined,
        categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: debouncedSearch || undefined,
        assignedUserId: assignedFilter !== 'all' ? assignedFilter : undefined,
      }),
  });

  const { data: categories } = useQuery({
    queryKey: ['qa-categories'],
    queryFn: fetchQaCategories,
  });

  const handleRowClick = useCallback(
    (id: number) => {
      router.push(`/inquiries/${id}`);
    },
    [router],
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="問い合わせ一覧"
        actions={
          <Button onClick={() => router.push('/inquiries/new')}>
            <Plus className="mr-2 h-4 w-4" />
            新規問い合わせ
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="new">新規</SelectItem>
            <SelectItem value="in_progress">対応中</SelectItem>
            <SelectItem value="resolved">解決済み</SelectItem>
            <SelectItem value="converted_to_qa">QA変換済</SelectItem>
          </SelectContent>
        </Select>

        {/* Category filter */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat.id} value={String(cat.id)}>
                {cat.categoryName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="件名・本文で検索..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Assigned user filter — admin/staff only */}
        {isInternalUser && (
          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="担当者フィルター" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="unassigned">未アサイン</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <InquiriesLoadingSkeleton />
      ) : !inquiries || inquiries.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />}
          title="問い合わせがありません"
          description="新規問い合わせを作成してください"
          action={{
            label: '新規問い合わせ',
            onClick: () => router.push('/inquiries/new'),
          }}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">ステータス</TableHead>
                <TableHead>件名</TableHead>
                {!selectedBusinessId && (
                  <TableHead className="w-32">事業</TableHead>
                )}
                <TableHead className="w-36">カテゴリ</TableHead>
                <TableHead className="w-28">起票者</TableHead>
                <TableHead className="w-28">担当者</TableHead>
                <TableHead className="w-28">起票日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inquiries.map((inquiry) => (
                <TableRow
                  key={inquiry.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(inquiry.id)}
                >
                  <TableCell>
                    <InquiryStatusBadge status={inquiry.inquiryStatus} />
                  </TableCell>
                  <TableCell className="font-medium max-w-xs">
                    <span className="line-clamp-1">{inquiry.inquirySubject}</span>
                  </TableCell>
                  {!selectedBusinessId && (
                    <TableCell className="text-sm text-muted-foreground">
                      {inquiry.business?.businessName ?? '-'}
                    </TableCell>
                  )}
                  <TableCell className="text-sm text-muted-foreground">
                    {inquiry.category?.categoryName ?? '-'}
                  </TableCell>
                  <TableCell className="text-sm">{inquiry.creator.userName}</TableCell>
                  <TableCell className="text-sm">
                    {inquiry.assignedUser?.userName ?? (
                      <span className="text-muted-foreground">未アサイン</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(inquiry.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function InquiriesLoadingSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">ステータス</TableHead>
            <TableHead>件名</TableHead>
            <TableHead className="w-32">事業</TableHead>
            <TableHead className="w-36">カテゴリ</TableHead>
            <TableHead className="w-28">起票者</TableHead>
            <TableHead className="w-28">担当者</TableHead>
            <TableHead className="w-28">起票日</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
