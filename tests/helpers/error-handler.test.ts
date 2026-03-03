import { describe, it, expect } from 'vitest';
import { ApiError, handleApiError } from '@/lib/error-handler';

// ============================================
// ApiError クラス
// ============================================

describe('ApiError', () => {
  it('badRequest は 400 ステータスを返す', () => {
    const error = ApiError.badRequest('入力が不正です');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('入力が不正です');
  });

  it('badRequest にフィールド詳細を含められる', () => {
    const details = [{ field: 'name', message: '必須です' }];
    const error = ApiError.badRequest('入力エラー', details);
    expect(error.details).toEqual(details);
  });

  it('unauthorized は 401 ステータスを返す', () => {
    const error = ApiError.unauthorized();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('認証が必要です');
  });

  it('unauthorized にカスタムメッセージを設定できる', () => {
    const error = ApiError.unauthorized('セッション期限切れ');
    expect(error.message).toBe('セッション期限切れ');
  });

  it('forbidden は 403 ステータスを返す', () => {
    const error = ApiError.forbidden();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('notFound は 404 ステータスを返す', () => {
    const error = ApiError.notFound();
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('conflict は 409 ステータスを返す', () => {
    const error = ApiError.conflict();
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });
});

// ============================================
// handleApiError
// ============================================

describe('handleApiError', () => {
  it('ApiError を JSON レスポンスに変換する', async () => {
    const error = ApiError.unauthorized();
    const response = handleApiError(error);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('認証が必要です');
  });

  it('ApiError にフィールド詳細を含める', async () => {
    const error = ApiError.badRequest('入力エラー', [
      { field: 'email', message: '不正な形式です' },
    ]);
    const response = handleApiError(error);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.details).toEqual([{ field: 'email', message: '不正な形式です' }]);
  });

  it('不明なエラーは 500 Internal Error', async () => {
    const error = new Error('unexpected');
    const response = handleApiError(error);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
