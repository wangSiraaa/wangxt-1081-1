import type { ApiResponse } from '../../shared/types.js';

const API_BASE =
  (typeof window !== 'undefined' && (window as any).__API_BASE__) ||
  (import.meta.env?.VITE_API_URL as string) ||
  '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const resp = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!resp.ok) {
    let body: ApiResponse;
    try {
      body = (await resp.json()) as ApiResponse;
    } catch {
      body = { success: false, error: `HTTP ${resp.status}` };
    }
    throw new Error(body.error || `Request failed with status ${resp.status}`);
  }

  return (await resp.json()) as ApiResponse<T>;
}

export const api = {
  get<T>(url: string) {
    return request<T>(url, { method: 'GET' });
  },
  post<T>(url: string, body?: unknown) {
    return request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  put<T>(url: string, body?: unknown) {
    return request<T>(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  delete<T>(url: string) {
    return request<T>(url, { method: 'DELETE' });
  },
};
