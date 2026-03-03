'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { useToast } from '@/hooks/use-toast';

// ============================================
// 型定義
// ============================================

interface AnnouncementData {
  id: number;
  businessId: number | null;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  targetScope: 'internal' | 'all';
  publishedAt: string | null;
  expiresAt: string | null;
}

interface BusinessOption {
  id: number;
  businessName: string;
}

// ============================================
// Props
// ============================================

interface Props {
  id?: string;
}

// ============================================
// メインコンポーネント
// ============================================

export function AnnouncementFormClient({ id }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');
  const [targetScope, setTargetScope] = useState<'internal' | 'all'>('internal');
  const [businessId, setBusinessId] = useState<string>('common');
  const [publishedAt, setPublishedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 既存データ取得（編集時）
  const { data: existing, isLoading: isLoadingExisting } = useQuery<{ data: AnnouncementData }>({
    queryKey: ['announcement', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/announcements/${id}`);
      if (!res.ok) throw new Error('取得に失敗しました');
      return res.json();
    },
    enabled: isEdit,
  });

  // 事業一覧取得
  const { data: businessesData } = useQuery<{ data: BusinessOption[] }>({
    queryKey: ['businesses-for-select'],
    queryFn: async () => {
      const res = await fetch('/api/v1/businesses?pageSize=100');
      if (!res.ok) throw new Error('事業の取得に失敗しました');
      return res.json();
    },
  });

  const businesses = businessesData?.data ?? [];

  // 既存データの反映
  useEffect(() => {
    if (existing?.data) {
      const a = existing.data;
      setTitle(a.title);
      setContent(a.content);
      setPriority(a.priority);
      setTargetScope(a.targetScope);
      setBusinessId(a.businessId ? String(a.businessId) : 'common');
      setPublishedAt(a.publishedAt ? a.publishedAt.slice(0, 16) : '');
      setExpiresAt(a.expiresAt ? a.expiresAt.slice(0, 16) : '');
    }
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast({ message: 'タイトルと本文は必須です', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        content: content.trim(),
        priority,
        targetScope,
        businessId: businessId === 'common' ? null : parseInt(businessId, 10),
        publishedAt: publishedAt || null,
        expiresAt: expiresAt || null,
      };

      const url = isEdit ? `/api/v1/announcements/${id}` : '/api/v1/announcements';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? '保存に失敗しました');
      }

      toast({ message: isEdit ? '更新しました' : '作成しました', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      router.push('/announcements');
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存に失敗しました';
      toast({ message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishNow = () => {
    setPublishedAt(new Date().toISOString().slice(0, 16));
  };

  if (isEdit && isLoadingExisting) {
    return (
      <div>
        <PageHeader
          title="お知らせ編集"
          breadcrumbs={[
            { label: 'お知らせ管理', href: '/announcements' },
            { label: '編集' },
          ]}
        />
        <div className="p-4 sm:p-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'お知らせ編集' : 'お知らせ作成'}
        breadcrumbs={[
          { label: 'お知らせ管理', href: '/announcements' },
          { label: isEdit ? '編集' : '新規作成' },
        ]}
      />

      <form onSubmit={handleSubmit} className="p-4 sm:p-6 max-w-2xl space-y-6">
        {/* タイトル */}
        <div className="space-y-2">
          <Label htmlFor="title">タイトル *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="お知らせのタイトル"
            maxLength={200}
          />
        </div>

        {/* 本文 */}
        <div className="space-y-2">
          <Label htmlFor="content">本文 *</Label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="お知らせの本文を入力"
            className="w-full min-h-[120px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* 設定行 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 優先度 */}
          <div className="space-y-2">
            <Label>優先度</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">通常</SelectItem>
                <SelectItem value="important">重要</SelectItem>
                <SelectItem value="urgent">緊急</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 対象 */}
          <div className="space-y-2">
            <Label>公開対象</Label>
            <Select value={targetScope} onValueChange={(v) => setTargetScope(v as typeof targetScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">社内のみ</SelectItem>
                <SelectItem value="all">社内 + 代理店</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 対象事業 */}
          <div className="space-y-2">
            <Label>対象事業</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger>
                <SelectValue />
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
          </div>
        </div>

        {/* 公開日時 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="publishedAt">公開日時</Label>
            <div className="flex gap-2">
              <Input
                id="publishedAt"
                type="datetime-local"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
              />
              <Button type="button" variant="outline" size="sm" onClick={handlePublishNow}>
                今すぐ
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              未設定の場合は下書きとして保存されます
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiresAt">有効期限</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              未設定の場合は無期限
            </p>
          </div>
        </div>

        {/* ボタン */}
        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : isEdit ? '更新する' : '作成する'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/announcements')}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
        </div>
      </form>
    </div>
  );
}
