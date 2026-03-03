import type { ApiListResponse, ApiSingleResponse, ApiErrorResponse, ListParams, PaginationMeta } from '@/types/api';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL = '/api/v1') {
    this.baseURL = baseURL;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // 204 No Content など空ボディの場合は JSON パースをスキップ
    if (response.status === 204) {
      if (!response.ok) {
        throw new ApiClientError('APIエラーが発生しました', 'UNKNOWN', response.status);
      }
      return undefined as T;
    }

    const json = await response.json();

    if (!response.ok) {
      const error = json as ApiErrorResponse;
      throw new ApiClientError(
        error.error?.message ?? 'APIエラーが発生しました',
        error.error?.code ?? 'UNKNOWN',
        response.status,
        error.error?.details,
      );
    }

    return json;
  }

  async getList<T>(
    endpoint: string,
    params?: ListParams,
  ): Promise<{ data: T[]; meta: PaginationMeta }> {
    const searchParams = new URLSearchParams();

    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.search) searchParams.set('search', params.search);
    // 複数列ソート: sort=field1:asc,field2:desc
    if (params?.sort && params.sort.length > 0) {
      searchParams.set('sort', params.sort.map((s) => `${s.field}:${s.direction}`).join(','));
    } else if (params?.sortField) {
      // 後方互換: 単一ソート
      searchParams.set('sortField', params.sortField);
      if (params?.sortDirection) searchParams.set('sortDirection', params.sortDirection);
    }
    if (params?.filters) {
      for (const [key, value] of Object.entries(params.filters)) {
        if (value) searchParams.set(`filter[${key}]`, value);
      }
    }

    const qs = searchParams.toString();
    const separator = endpoint.includes('?') ? '&' : '?';
    const fullEndpoint = qs ? `${endpoint}${separator}${qs}` : endpoint;
    const json = await this.request<ApiListResponse<T>>(fullEndpoint);

    return { data: json.data, meta: json.meta };
  }

  async getById<T>(endpoint: string, id: string | number): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(`${endpoint}/${id}`);
    return json.data;
  }

  async create<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return json.data;
  }

  async update<T>(endpoint: string, id: string | number, data: Record<string, unknown>): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(`${endpoint}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return json.data;
  }

  async patch<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return json.data;
  }

  async get<T>(endpoint: string): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(endpoint);
    return json.data;
  }

  async put<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    const json = await this.request<ApiSingleResponse<T>>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return json.data;
  }

  async remove(endpoint: string, id: string | number): Promise<void> {
    await this.request(`${endpoint}/${id}`, { method: 'DELETE' });
  }

  // ============================================
  // ファイルアップロード（multipart/form-data）
  // ============================================

  async uploadFile(
    file: File,
    directory: string,
  ): Promise<{ key: string; url: string; filename: string; size: number; contentType: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('directory', directory);

    const response = await fetch(`${this.baseURL}/upload`, {
      method: 'POST',
      body: formData,
      // Content-Type を設定しない（ブラウザが boundary 付きで自動設定）
    });

    const json = await response.json();

    if (!response.ok) {
      const error = json as ApiErrorResponse;
      throw new ApiClientError(
        error.error?.message ?? 'アップロードに失敗しました',
        error.error?.code ?? 'UPLOAD_FAILED',
        response.status,
        error.error?.details,
      );
    }

    return (json as { data: { key: string; url: string; filename: string; size: number; contentType: string } }).data;
  }

  async deleteFile(key: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/upload/${key}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 204) {
      let json: ApiErrorResponse | null = null;
      try { json = await response.json(); } catch { /* empty */ }
      throw new ApiClientError(
        json?.error?.message ?? 'ファイルの削除に失敗しました',
        json?.error?.code ?? 'DELETE_FAILED',
        response.status,
      );
    }
  }
}

export const apiClient = new ApiClient();
