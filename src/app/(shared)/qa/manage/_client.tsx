'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Search, Pencil, Trash2, GripVertical, Globe, Lock, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

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
  businessId: number | null;
  businessName: string | null;
  itemTitle: string;
  itemQuestion: string;
  itemAnswer: string;
  itemStatus: 'draft' | 'published';
  itemIsPublic: boolean;
  itemViewCount: number;
  itemSortOrder: number;
  attachmentCount: number;
  createdAt: string;
  category: { categoryName: string };
  creator: { id: number; userName: string };
}

interface CategoryDialogState {
  open: boolean;
  mode: 'create' | 'edit';
  category: QaCategory | null;
}

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  if (status === 'published') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
        公開中
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      下書き
    </Badge>
  );
}

function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function CategoryDialog({
  state,
  onClose,
  onSuccess,
}: {
  state: CategoryDialogState;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state.category) {
      setName(state.category.categoryName);
      setDescription(state.category.categoryDescription ?? '');
      setIsActive(state.category.categoryIsActive);
    } else {
      setName('');
      setDescription('');
      setIsActive(true);
    }
  }, [state.category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const body = {
        categoryName: name.trim(),
        categoryDescription: description.trim() || null,
        categoryIsActive: isActive,
      };
      const url =
        state.mode === 'edit' && state.category
          ? `/api/v1/qa/categories/${state.category.id}`
          : '/api/v1/qa/categories';
      const method = state.mode === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ message: state.mode === 'edit' ? 'カテゴリを更新しました' : 'カテゴリを作成しました', type: 'success' });
      onSuccess();
    } catch {
      toast({ message: '操作に失敗しました', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.mode === 'edit' ? 'カテゴリを編集' : '新規カテゴリ作成'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">
              カテゴリ名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：よくある質問"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">説明</Label>
            <Input
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="カテゴリの説明（任意）"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="cat-active"
              checked={isActive}
              onCheckedChange={(v) => setIsActive(Boolean(v))}
            />
            <Label htmlFor="cat-active" className="cursor-pointer">
              有効
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              キャンセル
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortableCategoryRow({
  cat,
  onEdit,
  onDelete,
  isDeleting,
}: {
  cat: QaCategory;
  onEdit: (cat: QaCategory) => void;
  onDelete: (cat: QaCategory) => void;
  isDeleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell>
        <button type="button" className="cursor-grab active:cursor-grabbing touch-none" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="font-medium">{cat.categoryName}</TableCell>
      <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
        {cat.categoryDescription ?? '-'}
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="outline">{cat.itemCount}</Badge>
      </TableCell>
      <TableCell>
        {cat.categoryIsActive ? (
          <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 text-xs">
            有効
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            無効
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onEdit(cat)}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">編集</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => onDelete(cat)}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">削除</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CategoriesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localCategories, setLocalCategories] = useState<QaCategory[]>([]);
  const [dialog, setDialog] = useState<CategoryDialogState>({
    open: false,
    mode: 'create',
    category: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: categories = [], isLoading } = useQuery<QaCategory[]>({
    queryKey: ['qa-categories'],
    queryFn: async () => {
      const res = await fetch('/api/v1/qa/categories');
      const json = await res.json();
      return json.data ?? [];
    },
  });

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      const res = await fetch('/api/v1/qa/categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error('Reorder failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-categories'] });
    },
    onError: () => {
      setLocalCategories(categories);
      toast({ message: '並び替えに失敗しました', type: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/v1/qa/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-categories'] });
      toast({ message: 'カテゴリを削除しました', type: 'success' });
    },
    onError: () => {
      toast({ message: 'カテゴリの削除に失敗しました', type: 'error' });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localCategories.findIndex((c) => c.id === active.id);
    const newIndex = localCategories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(localCategories, oldIndex, newIndex);
    setLocalCategories(reordered);
    reorderMutation.mutate(reordered.map((c) => c.id));
  };

  const handleDelete = (cat: QaCategory) => {
    if (cat.itemCount > 0) {
      toast({ message: 'QA項目が含まれているカテゴリは削除できません', type: 'error' });
      return;
    }
    if (!confirm(`カテゴリ「${cat.categoryName}」を削除しますか？`)) return;
    deleteMutation.mutate(cat.id);
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['qa-categories'] });
    setDialog({ open: false, mode: 'create', category: null });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => setDialog({ open: true, mode: 'create', category: null })}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          新規カテゴリ
        </Button>
      </div>

      <div className="border rounded-lg overflow-auto max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-muted/50">
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>カテゴリ名</TableHead>
              <TableHead className="hidden sm:table-cell">説明</TableHead>
              <TableHead className="w-16">QA数</TableHead>
              <TableHead className="w-16">状態</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={4} cols={6} />
            ) : localCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  カテゴリがありません
                </TableCell>
              </TableRow>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={localCategories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {localCategories.map((cat) => (
                    <SortableCategoryRow
                      key={cat.id}
                      cat={cat}
                      onEdit={(c) => setDialog({ open: true, mode: 'edit', category: c })}
                      onDelete={handleDelete}
                      isDeleting={deleteMutation.isPending}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </TableBody>
        </Table>
      </div>

      <CategoryDialog
        state={dialog}
        onClose={() => setDialog({ open: false, mode: 'create', category: null })}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

function ItemsTab() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { businesses } = useBusiness();

  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [businessFilter, setBusinessFilter] = useState<string>('all');
  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: categories = [] } = useQuery<QaCategory[]>({
    queryKey: ['qa-categories'],
    queryFn: async () => {
      const res = await fetch('/api/v1/qa/categories');
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const itemsQueryKey = ['qa-items-manage', { search: debouncedSearch, status: statusFilter, category: categoryFilter, business: businessFilter }];

  const { data: items = [], isLoading } = useQuery<QaItem[]>({
    queryKey: itemsQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter);
      if (businessFilter !== 'all') params.set('businessId', businessFilter);
      const res = await fetch(`/api/v1/qa/items?${params.toString()}`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: number; currentStatus: 'draft' | 'published' }) => {
      const newStatus = currentStatus === 'published' ? 'draft' : 'published';
      const res = await fetch(`/api/v1/qa/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemStatus: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      return newStatus;
    },
    onSuccess: (newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['qa-items-manage'] });
      queryClient.invalidateQueries({ queryKey: ['qa-items'] });
      toast({
        message: newStatus === 'published' ? '公開しました' : '下書きに戻しました',
        type: 'success',
      });
    },
    onError: () => {
      toast({ message: 'ステータスの変更に失敗しました', type: 'error' });
    },
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="タイトルで検索..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <Select value={businessFilter} onValueChange={setBusinessFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="事業" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての事業</SelectItem>
                <SelectItem value="common">全社共通</SelectItem>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.businessName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="カテゴリ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのカテゴリ</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.categoryName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="published">公開中</SelectItem>
                <SelectItem value="draft">下書き</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" asChild className="self-end sm:self-auto">
          <Link href="/qa/manage/new">
            <Plus className="h-4 w-4 mr-1.5" />
            新規作成
          </Link>
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-muted/50">
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead className="w-28 hidden sm:table-cell">事業</TableHead>
              <TableHead className="w-32 hidden sm:table-cell">カテゴリ</TableHead>
              <TableHead className="w-24">ステータス</TableHead>
              <TableHead className="w-16 hidden md:table-cell">公開</TableHead>
              <TableHead className="w-16 hidden md:table-cell">閲覧数</TableHead>
              <TableHead className="w-28 hidden lg:table-cell">作成日</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={5} cols={8} />
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  QA項目がありません
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/qa/manage/${item.id}`)}
                >
                  <TableCell className="font-medium max-w-xs">
                    <span className="line-clamp-2">{item.itemTitle}</span>
                  </TableCell>
                  <TableCell className="text-sm hidden sm:table-cell">
                    {item.businessName ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.businessName}</span>
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-xs">全社共通</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                    {item.category.categoryName}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.itemStatus} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {item.itemIsPublic ? (
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                    {item.itemViewCount}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ja-JP') : '-'}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={toggleStatusMutation.isPending}
                      onClick={() =>
                        toggleStatusMutation.mutate({ id: item.id, currentStatus: item.itemStatus })
                      }
                    >
                      {item.itemStatus === 'published' ? '下書きに戻す' : '公開する'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function QaManageClient() {
  const { hasRole, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !hasRole(['admin', 'staff'])) {
      router.replace('/qa');
    }
  }, [isLoading, hasRole, router]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!hasRole(['admin', 'staff'])) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="QA管理"
        breadcrumbs={[
          { label: 'QA/ナレッジベース', href: '/qa' },
          { label: 'QA管理' },
        ]}
      />

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">QA項目一覧</TabsTrigger>
          <TabsTrigger value="categories">カテゴリ管理</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="mt-4">
          <ItemsTab />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <CategoriesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
