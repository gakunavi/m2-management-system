import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { ApiErrorResponse, ApiErrorCode } from '@/types/api';
import { logger } from '@/lib/logger';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public statusCode: number,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: Array<{ field: string; message: string }>) {
    return new ApiError('VALIDATION_ERROR', message, 400, details);
  }

  static unauthorized(message = '認証が必要です') {
    return new ApiError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = '権限がありません') {
    return new ApiError('FORBIDDEN', message, 403);
  }

  static notFound(message = 'リソースが見つかりません') {
    return new ApiError('NOT_FOUND', message, 404);
  }

  static conflict(message = 'データが既に存在します') {
    return new ApiError('CONFLICT', message, 409);
  }
}

export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  // Zodバリデーションエラー
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false as const,
        error: {
          code: 'VALIDATION_ERROR' as const,
          message: '入力内容にエラーがあります',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  // カスタムApiError
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false as const,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.statusCode },
    );
  }

  // Prisma既知エラー
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return NextResponse.json(
          { success: false as const, error: { code: 'CONFLICT' as const, message: 'データが既に存在します' } },
          { status: 409 },
        );
      case 'P2025':
        return NextResponse.json(
          { success: false as const, error: { code: 'NOT_FOUND' as const, message: 'データが見つかりません' } },
          { status: 404 },
        );
    }
  }

  // 予期しないエラー
  logger.error('Unhandled API error', error, 'API');
  return NextResponse.json(
    {
      success: false as const,
      error: {
        code: 'INTERNAL_ERROR' as const,
        message: 'サーバーエラーが発生しました',
      },
    },
    { status: 500 },
  );
}
