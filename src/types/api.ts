// 成功レスポンス（一覧）
export interface ApiListResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

// 成功レスポンス（単体）
export interface ApiSingleResponse<T> {
  success: true;
  data: T;
}

// エラーレスポンス
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type SortItem = { field: string; direction: 'asc' | 'desc' };

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  /** @deprecated 単一ソート用。sort[] を優先 */
  sortField?: string;
  /** @deprecated 単一ソート用。sort[] を優先 */
  sortDirection?: 'asc' | 'desc';
  /** 複数列ソート（優先度順） */
  sort?: SortItem[];
  filters?: Record<string, string>;
}
