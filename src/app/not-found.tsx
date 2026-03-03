import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <FileQuestion className="h-16 w-16 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-4xl font-bold mb-2">404</h1>
          <h2 className="text-xl font-semibold mb-2">ページが見つかりません</h2>
          <p className="text-muted-foreground">
            お探しのページは存在しないか、移動した可能性があります。
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">ダッシュボードへ戻る</Link>
        </Button>
      </div>
    </div>
  );
}
