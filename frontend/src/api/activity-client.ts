import type { ApiResponse } from "../types";
import type { ActivityDay, ActivityFilters } from "../types/activity";
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

function buildParams(filters?: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters?.project_ids && filters.project_ids.length > 0) params.set("project_ids", filters.project_ids.join(","));
  if (filters?.tag && filters.tag.length > 0) params.set("tag", filters.tag.join(","));
  if (filters?.date_from) params.set("date_from", filters.date_from);
  if (filters?.date_to) params.set("date_to", filters.date_to);
  if (filters?.group_by) params.set("group_by", filters.group_by);
  if (filters?.contributor) params.set("contributor", filters.contributor);
  return params.toString();
}

export async function collectActivity(projectId: number, date_from?: string, date_to?: string): Promise<ApiResponse<{ project_id: number; days: number }>> {
  return fetchJson("/v1/activity/collect", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, date_from, date_to }),
  });
}

export async function fetchActivity(filters?: ActivityFilters): Promise<ApiResponse<ActivityDay[]>> {
  const qs = buildParams(filters);
  return cachedGet<ActivityDay[]>(`/v1/activity${qs ? "?" + qs : ""}`, `activity:${qs}`);
}
