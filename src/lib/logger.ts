/**
 * 構造化ログユーティリティ
 *
 * - 開発環境: 人間が読みやすいフォーマット
 * - 本番環境: JSON 形式でログ集約サービス（CloudWatch, Datadog 等）に対応
 *
 * 環境変数:
 *   LOG_LEVEL: error | warn | info | debug（デフォルト: 開発=debug, 本番=info）
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  error?: unknown;
  meta?: Record<string, unknown>;
  timestamp: string;
}

function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
  if (envLevel && envLevel in LOG_PRIORITY) return envLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function formatEntry(entry: LogEntry): string {
  const prefix = entry.context ? `[${entry.context}]` : '';
  return `${prefix} ${entry.message}`.trim();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_PRIORITY[level] <= LOG_PRIORITY[getMinLevel()];
}

function log(level: LogLevel, message: string, context?: string, error?: unknown, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    context,
    error,
    meta,
    timestamp: new Date().toISOString(),
  };

  // 本番環境: JSON 形式（ログ集約対応）
  if (process.env.NODE_ENV === 'production') {
    const jsonLog = {
      ...entry,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    };
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      JSON.stringify(jsonLog),
    );
    return;
  }

  // 開発環境: 人間が読みやすい形式
  const formatted = formatEntry(entry);
  switch (level) {
    case 'error':
      // eslint-disable-next-line no-console
      console.error(formatted, error ?? '');
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(formatted, meta ?? '');
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(formatted, meta ?? '');
  }
}

export const logger = {
  error: (message: string, error?: unknown, context?: string) =>
    log('error', message, context, error),
  warn: (message: string, meta?: Record<string, unknown>, context?: string) =>
    log('warn', message, context, undefined, meta),
  info: (message: string, meta?: Record<string, unknown>, context?: string) =>
    log('info', message, context, undefined, meta),
  debug: (message: string, meta?: Record<string, unknown>, context?: string) =>
    log('debug', message, context, undefined, meta),
};
