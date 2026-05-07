export { customFetch, setBaseUrl, setAuthTokenGetter, ApiError } from "@workspace/api-client-react";
export type { AuthTokenGetter } from "@workspace/api-client-react";

import { customFetch } from "@workspace/api-client-react";

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
  return customFetch<T>(`${path}${params ? qs(params) : ""}`);
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  return customFetch<T>(path, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function put<T>(path: string, body?: unknown): Promise<T> {
  return customFetch<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patch<T>(path: string, body?: unknown): Promise<T> {
  return customFetch<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function del<T = void>(path: string): Promise<T> {
  return customFetch<T>(path, { method: "DELETE" });
}
