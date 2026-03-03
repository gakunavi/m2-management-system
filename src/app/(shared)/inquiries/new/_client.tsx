'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/hooks/use-business';

interface QaCategory {
  id: number;
  categoryName: string;
}

async function fetchQaCategories(): Promise<QaCategory[]> {
  const res = await fetch('/api/v1/qa/categories');
  if (!res.ok) throw new Error('カテゴリの取得に失敗しました');
  const json = await res.json();
  return json.data as QaCategory[];
}

export function NewInquiryClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { selectedBusinessId, businesses } = useBusiness();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [businessId, setBusinessId] = useState<string>(
    selectedBusinessId ? String(selectedBusinessId) : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});

  const { data: categories } = useQuery({
    queryKey: ['qa-categories'],
    queryFn: fetchQaCategories,
  });

  const validate = (): boolean => {
    const newErrors: { subject?: string; body?: string } = {};
    if (!subject.trim()) newErrors.subject = '件名は必須です';
    if (!body.trim()) newErrors.body = '本文は必須です';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        inquirySubject: subject.trim(),
        inquiryBody: body.trim(),
      };
      if (categoryId && categoryId !== 'none') payload.inquiryCategoryId = Number(categoryId);
      if (businessId && businessId !== 'none') payload.inquiryBusinessId = Number(businessId);

      const res = await fetch('/api/v1/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error?.message ?? '問い合わせの作成に失敗しました');
      }

      toast({ message: '問い合わせを作成しました', type: 'success' });
      router.push('/inquiries');
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : '問い合わせの作成に失敗しました',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="新規問い合わせ"
        breadcrumbs={[
          { label: '問い合わせ一覧', href: '/inquiries' },
          { label: '新規問い合わせ' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">問い合わせ内容の入力</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="subject">
                件名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
                }}
                placeholder="件名を入力してください"
                disabled={submitting}
              />
              {errors.subject && (
                <p className="text-xs text-destructive">{errors.subject}</p>
              )}
            </div>

            {/* Business */}
            <div className="space-y-1.5">
              <Label htmlFor="business">事業</Label>
              <Select value={businessId || undefined} onValueChange={setBusinessId} disabled={submitting}>
                <SelectTrigger id="business">
                  <SelectValue placeholder="事業を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">選択しない</SelectItem>
                  {businesses.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.businessName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="category">カテゴリ</Label>
              <Select value={categoryId || undefined} onValueChange={setCategoryId} disabled={submitting}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="カテゴリを選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">選択しない</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.categoryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label htmlFor="body">
                本文 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (errors.body) setErrors((prev) => ({ ...prev, body: undefined }));
                }}
                placeholder="問い合わせ内容を詳しく記入してください"
                rows={8}
                disabled={submitting}
              />
              {errors.body && (
                <p className="text-xs text-destructive">{errors.body}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? '送信中...' : '送信する'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/inquiries')}
                disabled={submitting}
              >
                キャンセル
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
