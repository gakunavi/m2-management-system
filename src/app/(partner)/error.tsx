'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PortalError({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    console.error('[Portal Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">エラーが発生しました</h2>
        <p className="text-sm text-muted-foreground">
          ページの読み込み中にエラーが発生しました。
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">ID: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push('/portal')}>
            ポータルへ
          </Button>
          <Button onClick={reset}>再試行</Button>
        </div>
      </div>
    </div>
  );
}
