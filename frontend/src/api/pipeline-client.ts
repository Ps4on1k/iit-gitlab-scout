import type { ApiResponse } from "../types";

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
  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: (body as any).error || `HTTP ${res.status}` };
  }
  return res.json() as Promise<ApiResponse<T>>;
}

export async function collectPipelines(projectId: number): Promise<ApiResponse<{ total: number; success: number; failed: number; running: number }>> {
  return fetchJson("/v1/pipelines/collect", { method: "POST", body: JSON.stringify({ project_id: projectId }) });
}
