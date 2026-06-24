import type { ApiResponse } from "../types";
import type { ProjectLanguage, LanguageSummary, StackFilters } from "../types/stack";
import { getCached, setCache } from "../utils/cache";

const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: (body as any).error || `HTTP ${res.status}` };
  }
  return res.json() as Promise<ApiResponse<T>>;
}

async function cachedGet<T>(url: string, cacheKey: string): Promise<ApiResponse<T>> {
  const cached = getCached<ApiResponse<T>>(cacheKey);
  if (cached) return cached;
  const result = await fetchJson<T>(url);
  if (result.ok) setCache(cacheKey, result);
  return result;
}

function buildParams(filters?: StackFilters): string {
  const params = new URLSearchParams();
  if (filters?.project_ids && filters.project_ids.length > 0) params.set("project_ids", filters.project_ids.join(","));
  if (filters?.tag && filters.tag.length > 0) params.set("tag", filters.tag.join(","));
  if (filters?.language && filters.language.length > 0) params.set("language", filters.language.join(","));
  return params.toString();
}

export async function collectStack(projectId: number): Promise<ApiResponse<{ project_id: number; path: string; languages: any[] }>> {
  return fetchJson("/v1/stack/collect", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  });
}

export async function fetchLanguages(filters?: StackFilters): Promise<ApiResponse<ProjectLanguage[]>> {
  const qs = buildParams(filters);
  return cachedGet<ProjectLanguage[]>(`/v1/stack/languages${qs ? "?" + qs : ""}`, `stack-langs:${qs}`);
}

export async function fetchLanguageSummary(filters?: StackFilters): Promise<ApiResponse<LanguageSummary[]>> {
  const qs = buildParams(filters);
  return cachedGet<LanguageSummary[]>(`/v1/stack/languages/summary${qs ? "?" + qs : ""}`, `stack-summary:${qs}`);
}
