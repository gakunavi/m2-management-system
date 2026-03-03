'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useBusiness } from '@/hooks/use-business';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface QaCategory {
  id: number;
  categoryName: string;
  categoryIsActive: boolean;
}

export function QaNewClient() {
  const router = useRouter();
  const { hasRole, isLoading: authLoading } = useAuth();
  const { businesses, selectedBusinessId } = useBusiness();
  const { toast } = useToast();

  const [categoryId, setCategoryId] = useState('');
  const [businessId, setBusinessId] = useState<string>(
    selectedBusinessId ? String(selectedBusinessId) : 'common',
  );
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { data: categories = [], isLoading: catLoading } = useQuery<QaCategory[]>({
    queryKey: ['qa-categories'],
    queryFn: async () => {
      const res = await fetch('/api/v1/qa/categories');
      const json = await res.json();
      return (json.data ?? []).filter((c: QaCategory) => c.categoryIsActive);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !title.trim() || !answer.trim()) {
      toast({ message: '必須項目を入力してください', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/qa/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: Number(categoryId),
          businessId: businessId === 'common' ? null : Number(businessId),
          itemTitle: title.trim(),
          itemQuestion: question.trim(),
          itemAnswer: answer.trim(),
          itemIsPublic: isPublic,
          itemStatus: 'draft',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error?.message ?? 'Failed');
      }
      toast({ message: 'QA項目を作成しました', type: 'success' });
      router.push('/qa/manage');
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : 'QA項目の作成に失敗しました',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!hasRole(['admin', 'staff'])) {
    router.replace('/qa');
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="QA項目を新規作成"
        breadcrumbs={[
          { label: 'QA/ナレッジベース', href: '/qa' },
          { label: 'QA管理', href: '/qa/manage' },
          { label: '新規作成' },
        ]}
      />

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="qa-category">
              カテゴリ <span className="text-destructive">*</span>
            </Label>
            {catLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={categoryId || undefined} onValueChange={setCategoryId}>
                <SelectTrigger id="qa-category">
                  <SelectValue placeholder="カテゴリを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.categoryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Business */}
          <div className="space-y-1.5">
            <Label htmlFor="qa-business">対象事業</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger id="qa-business">
                <SelectValue placeholder="対象事業を選択..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="common">全社共通</SelectItem>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.businessName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              「全社共通」の場合、すべてのユーザーに表示されます。
            </p>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="qa-title">
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qa-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="QA項目のタイトルを入力"
              required
            />
          </div>

          {/* Question */}
          <div className="space-y-1.5">
            <Label htmlFor="qa-question">質問</Label>
            <textarea
              id="qa-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="質問内容を入力（任意）"
              rows={4}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
          </div>

          {/* Answer */}
          <div className="space-y-1.5">
            <Label htmlFor="qa-answer">
              回答 <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="qa-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="回答内容を入力"
              rows={8}
              required
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
          </div>

          {/* Public flag */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="qa-public"
              checked={isPublic}
              onCheckedChange={(v) => setIsPublic(Boolean(v))}
            />
            <Label htmlFor="qa-public" className="cursor-pointer">
              一般公開する
            </Label>
            <span className="text-xs text-muted-foreground">（パートナーにも表示されます）</span>
          </div>

          <p className="text-xs text-muted-foreground">
            作成後は「下書き」状態になります。QA管理画面から「公開する」を押すと公開されます。
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={submitting || !categoryId || !title.trim() || !answer.trim()}>
              {submitting ? '作成中...' : '作成する'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/qa/manage')}
              disabled={submitting}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
