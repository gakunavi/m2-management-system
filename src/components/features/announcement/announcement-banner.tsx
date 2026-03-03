'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// 型定義
// ============================================

interface AnnouncementData {
  id: number;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  publishedAt: string | null;
  business: { id: number; businessName: string } | null;
}

interface AnnouncementsResponse {
  success: boolean;
  data: AnnouncementData[];
}

// ============================================
// 優先度別スタイル
// ============================================

const priorityStyles = {
  urgent: {
    container: 'bg-destructive/10 border-destructive/30 text-destructive',
    icon: AlertTriangle,
  },
  important: {
    container: 'bg-yellow-50 border-yellow-300 text-yellow-800',
    icon: Megaphone,
  },
  normal: {
    container: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: Info,
  },
} as const;

// ============================================
// Props
// ============================================

interface Props {
  /** 事業IDフィルタ（null=全社のみ表示） */
  businessId?: number | null;
  /** 最大表示件数 */
  maxItems?: number;
}

// ============================================
// メインコンポーネント
// ============================================

export function AnnouncementBanner({ businessId, maxItems = 3 }: Props) {
  const { data: response } = useQuery<AnnouncementsResponse>({
    queryKey: ['announcements', 'banner', businessId ?? 'all'],
    queryFn: async () => {
      const res = await fetch('/api/v1/announcements');
      if (!res.ok) throw new Error('お知らせの取得に失敗しました');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
  });

  const announcements = (response?.data ?? [])
    .filter((a) => {
      // 事業IDフィルタ: 全社共通(businessId=null)は常に表示 + 指定事業のお知らせ
      if (!a.business) return true;
      if (businessId && a.business.id === businessId) return true;
      if (!businessId) return true; // 全体ビューは全て表示
      return false;
    })
    .slice(0, maxItems);

  if (announcements.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {announcements.map((announcement) => {
        const style = priorityStyles[announcement.priority] ?? priorityStyles.normal;
        const Icon = style.icon;

        return (
          <div
            key={announcement.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3',
              style.container,
            )}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{announcement.title}</p>
              <p className="mt-0.5 text-sm opacity-90 line-clamp-2">
                {announcement.content}
              </p>
              {announcement.business && (
                <p className="mt-1 text-xs opacity-70">
                  対象: {announcement.business.businessName}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
