import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export function LoadingSpinner({ className, size = 'md', message }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <Loader2 className={cn('animate-spin text-muted-foreground', sizeMap[size])} />
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
