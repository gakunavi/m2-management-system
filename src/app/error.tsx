'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    // エラーログ（Phase 1以降で外部サービス連携）
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <AlertTriangle className="h-16 w-16 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2">エラーが発生しました</h1>
          <p className="text-muted-foreground">
            予期せぬエラーが発生しました。再度お試しいただくか、問題が続く場合は管理者にお問い合わせください。
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground mt-2">
              エラーID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            ダッシュボードへ
          </Button>
          <Button onClick={reset}>再試行</Button>
        </div>
      </div>
    </div>
  );
}
