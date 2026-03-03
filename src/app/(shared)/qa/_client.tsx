'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, BookOpen, Eye, Paperclip, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface QaCategory {
  id: number;
  categoryName: string;
  categoryDescription: string | null;
  categorySortOrder: number;
  categoryIsActive: boolean;
  itemCount: number;
}

interface QaItem {
  id: number;
  categoryId: number;
  itemTitle: string;
  itemQuestion: string;
  itemAnswer: string;
  itemStatus: string;
  itemIsPublic: boolean;
  itemViewCount: number;
  itemSortOrder: number;
  attachmentCount: number;
  businessId: number | null;
  businessName: string | null;
  category: { categoryName: string };
  creator: { id: number; userName: string };
}

interface QaItemDetail extends QaItem {
  attachments: {
    id: number;
    fileName: string;
    fileUrl: string;
    fileSize: number;
  }[];
}

function CategorySkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-md" />
      ))}
    </div>
  );
}

function ItemsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

function QaItemAccordion({ item }: { item: QaItem }) {
  const [detail, setDetail] = useState<QaItemDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleOpen = async (value: string | string[]) => {
    const v = Array.isArray(value) ? value[0] : value;
    if (v && !detail && !loadingDetail) {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/v1/qa/items/${item.id}`);
        const json = await res.json();
        if (json.success) {
          setDetail(json.data);
        }
      } catch {
        // fallback to base item data
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const attachments = detail?.attachments ?? [];

  return (
    <Accordion type="single" collapsible onValueChange={handleOpen}>
      <AccordionItem value={String(item.id)} className="border-border">
        <AccordionTrigger className="hover:no-underline px-3 sm:px-4 py-3">
          <div className="flex flex-1 items-center gap-2 sm:gap-3 pr-2 min-w-0">
            <span className="font-medium text-foreground text-left leading-snug truncate sm:whitespace-normal">{item.itemTitle}</span>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Badge variant="outline" className="text-xs gap-1">
                <Eye className="h-3 w-3" />
                {item.itemViewCount}
              </Badge>
              {item.attachmentCount > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Paperclip className="h-3 w-3" />
                  {item.attachmentCount}
                </Badge>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {loadingDetail ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : (
            <div className="space-y-4">
              {item.itemQuestion && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">質問</p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.itemQuestion}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">回答</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.itemAnswer}</p>
              </div>
              {attachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">添付ファイル</p>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline border rounded px-2 py-1"
                      >
                        <Paperclip className="h-3 w-3" />
                        {att.fileName}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function QaKnowledgeBaseClient() {
  const { hasRole } = useAuth();
  const isAdminOrStaff = hasRole(['admin', 'staff']);
  const { selectedBusinessId } = useBusiness();

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<QaCategory[]>({
    queryKey: ['qa-categories', { businessId: selectedBusinessId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBusinessId) params.set('businessId', String(selectedBusinessId));
      const qs = params.toString();
      const res = await fetch(`/api/v1/qa/categories${qs ? `?${qs}` : ''}`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const categories = categoriesData ?? [];

  const itemsQueryKey = ['qa-items', { categoryId: selectedCategoryId, search: debouncedSearch, businessId: selectedBusinessId }];
  const { data: itemsData, isLoading: itemsLoading } = useQuery<QaItem[]>({
    queryKey: itemsQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ status: 'published' });
      if (selectedCategoryId) params.set('categoryId', String(selectedCategoryId));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (selectedBusinessId) params.set('businessId', String(selectedBusinessId));
      const res = await fetch(`/api/v1/qa/items?${params.toString()}`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const items = itemsData ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="QA/ナレッジベース"
        actions={
          isAdminOrStaff ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/qa/manage">
                <Settings className="h-4 w-4 mr-1.5" />
                QA管理
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Left sidebar - Category list */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="sticky top-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
              カテゴリ
            </p>

            {categoriesLoading ? (
              <CategorySkeleton />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(null)}
                  className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                    selectedCategoryId === null
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    すべて
                  </span>
                  <Badge
                    variant={selectedCategoryId === null ? 'secondary' : 'outline'}
                    className="text-xs"
                  >
                    {categories.reduce((sum, c) => sum + c.itemCount, 0)}
                  </Badge>
                </button>

                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                      selectedCategoryId === cat.id
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="truncate text-left">{cat.categoryName}</span>
                    <Badge
                      variant={selectedCategoryId === cat.id ? 'secondary' : 'outline'}
                      className="text-xs ml-1 shrink-0"
                    >
                      {cat.itemCount}
                    </Badge>
                  </button>
                ))}
              </>
            )}
          </div>
        </aside>

        {/* Mobile category chips */}
        <div className="md:hidden w-full">
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategoryId === null
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              すべて
              <Badge variant="secondary" className="text-xs px-1">
                {categories.reduce((sum, c) => sum + c.itemCount, 0)}
              </Badge>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
                }`}
              >
                {cat.categoryName}
                <Badge variant="secondary" className="text-xs px-1">
                  {cat.itemCount}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        {/* Right main area */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="キーワードで検索..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category heading for context */}
          {selectedCategoryId !== null && (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                カテゴリ:{' '}
                <span className="font-medium text-foreground">
                  {categories.find((c) => c.id === selectedCategoryId)?.categoryName}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                クリア
              </button>
            </div>
          )}

          {/* QA items */}
          {itemsLoading ? (
            <ItemsSkeleton />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">
                {debouncedSearch ? '検索条件に一致するQA項目がありません' : 'QA項目がありません'}
              </p>
              {debouncedSearch && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  検索をクリア
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <QaItemAccordion key={item.id} item={item} />
              ))}
              <p className="text-xs text-muted-foreground text-right pt-1">
                {items.length}件のQA項目
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
