import type { ApiResponse, AuthResponse, User, ProjectConfig, BatchStatsResponse, DbContributor, CollectResult, ContributorMetrics, HeatmapData, ContributorFilters, AppUser } from "../types";
import type { Branch, BranchSummary, Issue, IssueSummary, DependencyAudit, DependencySummary } from "../types/analytics";
import { getCached, setCache, clearCache } from "../utils/cache";

const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
  clearCache();
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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

async function cachedGet<T>(url: string, cacheKey: string): Promise<ApiResponse<T>> {
  const cached = getCached<ApiResponse<T>>(cacheKey);
  if (cached) return cached;
  const result = await fetchJson<T>(url);
  if (result.ok) setCache(cacheKey, result);
  return result;
}

export async function login(username: string, password: string): Promise<ApiResponse<AuthResponse>> {
  return fetchJson<AuthResponse>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function getMe(): Promise<ApiResponse<User>> {
  return cachedGet<User>("/v1/auth/me", "me");
}

export async function fetchProjects(): Promise<ApiResponse<ProjectConfig[]>> {
  return cachedGet<ProjectConfig[]>("/v1/projects", "projects");
}

export async function createProject(data: {
  path: string; label: string; token: string; base_url?: string; tag?: string;
}): Promise<ApiResponse<ProjectConfig>> {
  const result = await fetchJson<ProjectConfig>("/v1/projects", { method: "POST", body: JSON.stringify(data) });
  if (result.ok) clearCache("projects");
  return result;
}

export async function updateProject(
  id: number, data: { path?: string; label?: string; token?: string; base_url?: string; tag?: string }
): Promise<ApiResponse<ProjectConfig>> {
  const result = await fetchJson<ProjectConfig>(`/v1/projects/${id}`, { method: "PUT", body: JSON.stringify(data) });
  if (result.ok) clearCache("projects");
  return result;
}

export async function deleteProject(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  const result = await fetchJson<{ deleted: boolean }>(`/v1/projects/${id}`, { method: "DELETE" });
  if (result.ok) clearCache("projects");
  return result;
}

export async function importProjectsYaml(yaml: string): Promise<ApiResponse<{ imported: { path: string; label: string }[]; errors: { path: string; error: string }[]; total: number }>> {
  const result = await fetchJson<{ imported: { path: string; label: string }[]; errors: { path: string; error: string }[]; total: number }>("/v1/projects/import-yaml", { method: "POST", body: JSON.stringify({ yaml }) });
  if (result.ok) clearCache("projects");
  return result;
}

export async function fetchBatchStats(month?: string, author?: string): Promise<ApiResponse<BatchStatsResponse>> {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (author) params.set("author", author);
  const qs = params.toString();
  return cachedGet<BatchStatsResponse>(`/v1/stats${qs ? "?" + qs : ""}`, `stats:${qs}`);
}

export async function collectContributors(projectId: number, dateFrom?: string, dateTo?: string): Promise<ApiResponse<CollectResult>> {
  const result = await fetchJson<CollectResult>("/v1/contributor-analytics/collect", {
    method: "POST", body: JSON.stringify({ project_id: projectId, date_from: dateFrom, date_to: dateTo }),
  });
  if (result.ok) clearCache("contributors");
  return result;
}

function buildContributorParams(filters?: ContributorFilters): string {
  const params = new URLSearchParams();
  if (filters?.project_ids && filters.project_ids.length > 0) params.set("project_ids", filters.project_ids.join(","));
  else if (filters?.project_id) params.set("project_id", String(filters.project_id));
  if (filters?.date_from) params.set("date_from", filters.date_from);
  if (filters?.date_to) params.set("date_to", filters.date_to);
  return params.toString();
}

export async function fetchContributorsList(filters?: ContributorFilters): Promise<ApiResponse<DbContributor[]>> {
  const qs = buildContributorParams(filters);
  return cachedGet<DbContributor[]>(`/v1/contributor-analytics${qs ? "?" + qs : ""}`, `contributors:${qs}`);
}

export async function fetchContributorMetrics(filters?: ContributorFilters): Promise<ApiResponse<ContributorMetrics>> {
  const qs = buildContributorParams(filters);
  return cachedGet<ContributorMetrics>(`/v1/contributor-analytics/metrics${qs ? "?" + qs : ""}`, `metrics:${qs}`);
}

export async function fetchContributorHeatmap(filters?: ContributorFilters): Promise<ApiResponse<HeatmapData>> {
  const qs = buildContributorParams(filters);
  return cachedGet<HeatmapData>(`/v1/contributor-analytics/heatmap${qs ? "?" + qs : ""}`, `heatmap:${qs}`);
}

export async function fetchUsers(): Promise<ApiResponse<AppUser[]>> {
  return cachedGet<AppUser[]>("/v1/users", "users");
}

export async function createUser(data: { username: string; password: string; role?: string }): Promise<ApiResponse<AppUser>> {
  const result = await fetchJson<AppUser>("/v1/users", { method: "POST", body: JSON.stringify(data) });
  if (result.ok) clearCache("users");
  return result;
}

export async function updateUser(id: number, data: { role?: string; is_active?: boolean }): Promise<ApiResponse<AppUser>> {
  const result = await fetchJson<AppUser>(`/v1/users/${id}`, { method: "PUT", body: JSON.stringify(data) });
  if (result.ok) clearCache("users");
  return result;
}

export async function changeUserPassword(id: number, password: string): Promise<ApiResponse<{ message: string }>> {
  return fetchJson(`/v1/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) });
}

export async function deleteUser(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  const result = await fetchJson<{ deleted: boolean }>(`/v1/users/${id}`, { method: "DELETE" });
  if (result.ok) clearCache("users");
  return result;
}

function buildAnalyticsParams(projectIds?: number[], tag?: string): string {
  const params = new URLSearchParams();
  if (projectIds && projectIds.length > 0) params.set("project_ids", projectIds.join(","));
  if (tag) params.set("tag", tag);
  return params.toString();
}

export async function collectBranches(projectId: number): Promise<ApiResponse<{ total: number; active: number; stale: number; merged: number }>> {
  return fetchJson("/v1/branches/collect", { method: "POST", body: JSON.stringify({ project_id: projectId }) });
}

export async function fetchBranches(projectIds?: number[], tag?: string, status?: string): Promise<ApiResponse<{ branches: Branch[]; summary: BranchSummary }>> {
  const parts: string[] = [];
  if (projectIds && projectIds.length > 0) parts.push(`project_ids=${projectIds.join(",")}`);
  if (tag) parts.push(`tag=${tag}`);
  if (status) parts.push(`status=${status}`);
  const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
  return fetchJson<{ branches: Branch[]; summary: BranchSummary }>(`/v1/branches${qs}`);
}

export async function collectIssues(projectId: number): Promise<ApiResponse<{ total: number; opened: number; closed: number }>> {
  return fetchJson("/v1/issues/collect", { method: "POST", body: JSON.stringify({ project_id: projectId }) });
}

export async function fetchIssues(projectIds?: number[], tag?: string, state?: string): Promise<ApiResponse<{ issues: Issue[]; summary: IssueSummary }>> {
  const parts: string[] = [];
  if (projectIds && projectIds.length > 0) parts.push(`project_ids=${projectIds.join(",")}`);
  if (tag) parts.push(`tag=${tag}`);
  if (state) parts.push(`state=${state}`);
  const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
  return fetchJson(`/v1/issues${qs}`);
}

export async function collectDependencies(projectId: number): Promise<ApiResponse<{ total: number; outdated: number }>> {
  return fetchJson("/v1/dependencies/collect", { method: "POST", body: JSON.stringify({ project_id: projectId }) });
}

export async function fetchDependencies(projectIds?: number[], tag?: string, source?: string): Promise<ApiResponse<{ dependencies: DependencyAudit[]; summary: DependencySummary }>> {
  const parts: string[] = [];
  if (projectIds && projectIds.length > 0) parts.push(`project_ids=${projectIds.join(",")}`);
  if (tag) parts.push(`tag=${tag}`);
  if (source) parts.push(`source=${source}`);
  const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
  return fetchJson(`/v1/dependencies${qs}`);
}
