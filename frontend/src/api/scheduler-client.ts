import type { ApiResponse } from "../types";
import { getCached, setCache } from "../utils/cache";

const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const token = getToken();
  const hasBody = !!options?.body;
  const headers: Record<string, string> = {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
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

export interface SchedulerTask {
  id: number;
  task_name: string;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchSchedulerSettings(): Promise<ApiResponse<SchedulerTask[]>> {
  return cachedGet<SchedulerTask[]>("/v1/scheduler", "scheduler");
}

export async function updateSchedulerTask(
  id: number,
  data: { enabled?: boolean; interval_minutes?: number }
): Promise<ApiResponse<SchedulerTask>> {
  const result = await fetchJson<SchedulerTask>(`/v1/scheduler/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (result.ok) {
    const { clearCache } = await import("../utils/cache");
    clearCache("scheduler");
  }
  return result;
}

export async function resetStatistics(): Promise<ApiResponse<{ cleared: string[] }>> {
  const result = await fetchJson<{ cleared: string[] }>("/v1/scheduler/reset-stats", {
    method: "POST",
  });
  if (result.ok) {
    const { clearCache } = await import("../utils/cache");
    clearCache("scheduler");
  }
  return result;
}

export async function fetchSchedulerErrors(limit?: number, offset?: number, taskName?: string): Promise<ApiResponse<{ entries: any[]; total: number }>> {
  const qs = new URLSearchParams();
  if (limit) qs.set("limit", String(limit));
  if (offset) qs.set("offset", String(offset));
  if (taskName) qs.set("task_name", taskName);
  return fetchJson(`/v1/scheduler/errors${qs.toString() ? "?" + qs.toString() : ""}`);
}

export async function clearSchedulerErrors(taskName?: string): Promise<ApiResponse<{ deleted: number }>> {
  const qs = taskName ? `?task_name=${encodeURIComponent(taskName)}` : "";
  return fetchJson(`/v1/scheduler/errors${qs}`, { method: "DELETE" });
}

export async function runAllSchedulerTasks(): Promise<ApiResponse<{ started: boolean }>> {
  const result = await fetchJson<{ started: boolean }>("/v1/scheduler/run-all", { method: "POST" });
  if (result.ok) {
    const { clearCache } = await import("../utils/cache");
    clearCache("scheduler");
  }
  return result;
}
