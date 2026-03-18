'use client';

import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import type { ChatMessageItem } from '@/types/chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: ChatMessageItem;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2 sm:gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* アイコン */}
      <div
        className={cn(
          'flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
      </div>

      {/* メッセージ本体 */}
      <div
        className={cn(
          'max-w-[85%] sm:max-w-[80%] rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-[13px] sm:text-sm min-w-0',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_table]:block [&_table]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-[11px] [&_table]:sm:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-1.5 [&_th]:sm:px-3 [&_th]:py-1 [&_th]:sm:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:whitespace-nowrap [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:sm:px-3 [&_td]:py-1 [&_td]:sm:py-1.5 [&_pre]:overflow-x-auto [&_pre]:text-[11px] [&_pre]:sm:text-xs [&_code]:text-[11px] [&_code]:sm:text-xs [&_p]:text-[13px] [&_p]:sm:text-sm [&_li]:text-[13px] [&_li]:sm:text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
