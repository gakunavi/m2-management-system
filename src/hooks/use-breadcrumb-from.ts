'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

/**
 * URLクエリパラメータ `from` から遷移元パンくず情報を取得する。
 *
 * 形式: ?from=/projects/3,案件詳細
 * → { label: '案件詳細', href: '/projects/3' }
 *
 * href 側には一覧の絞り込み・ソート等のクエリが含まれることがあり、
 * その中にカンマが現れる（例: `?sort=projectNo:asc,customerName:asc`）ため、
 * ラベルは「最後のカンマ以降」として切り出す。ラベルにカンマは含めない。
 */
export function useBreadcrumbFrom(): { label: string; href: string } | null {
  const searchParams = useSearchParams();

  return useMemo(() => {
    const from = searchParams.get('from');
    if (!from) return null;

    const commaIndex = from.lastIndexOf(',');
    if (commaIndex === -1) return null;

    const href = from.slice(0, commaIndex);
    const label = from.slice(commaIndex + 1);

    if (!href.startsWith('/') || !label) return null;

    return { label, href };
  }, [searchParams]);
}
