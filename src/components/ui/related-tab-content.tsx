'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';
import { EmptyState } from '@/components/ui/empty-state';
import type { RelatedTabConfig } from '@/types/config';

interface RelatedTabContentProps {
  config: RelatedTabConfig;
  parentId: string;
}

export function RelatedTabContent({ config, parentId }: RelatedTabContentProps) {
  const router = useRouter();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['related', config.apiEndpoint(parentId)],
    queryFn: async () => {
      const res = await fetch(`/api/v1${config.apiEndpoint(parentId)}`);
      if (!res.ok) throw new Error('関連データの取得に失敗しました');
      const json = await res.json() as { data: Record<string, unknown>[] };
      return json.data;
    },
  });

  if (isLoading) return <LoadingSpinner size="sm" />;
  if (error) return <ErrorDisplay message={(error as Error).message} onRetry={() => refetch()} />;
  if (!data || data.length === 0) {
    return <EmptyState title="関連データがありません" />;
  }

  return (
    <div className="rounded-md border overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {config.columns.map((col) => (
              <th
                key={col.key}
                className="h-9 px-3 text-left font-medium text-muted-foreground"
                style={{
                  width: col.width,
                  minWidth: col.minWidth ?? col.width ?? 80,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={(row.id as number) ?? i}
              className={`border-t hover:bg-muted/30 transition-colors ${
                config.detailPath ? 'cursor-pointer' : ''
              }`}
              onClick={
                config.detailPath
                  ? () => router.push(config.detailPath!(row.id as number))
                  : undefined
              }
            >
              {config.columns.map((col) => (
                <td key={col.key} className="h-9 px-3">
                  {col.render
                    ? col.render(row[col.key], row)
                    : row[col.key] != null
                      ? String(row[col.key])
                      : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
