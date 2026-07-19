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

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: () => void) {
  onUnauthorized = handler;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const token = getToken();
  const isDelete = options?.method === "DELETE";
  const headers: Record<string, string> = {
    ...(!isDelete ? { "Content-Type": "application/json" } : {}),
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers, cache: "no-store" });
  if (res.status === 401 && token) {
    clearToken();
    onUnauthorized?.();
    return { ok: false, error: "Сессия истекла. Войдите снова." };
  }
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

export async function changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<{ message: string }>> {
  return fetchJson("/v1/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function fetchProjects(): Promise<ApiResponse<ProjectConfig[]>> {
  return cachedGet<ProjectConfig[]>("/v1/projects", "projects");
}

export async function createProject(data: {
  path: string; label: string; token: string; base_url?: string; tags?: string[];
}): Promise<ApiResponse<ProjectConfig>> {
  const result = await fetchJson<ProjectConfig>("/v1/projects", { method: "POST", body: JSON.stringify(data) });
  if (result.ok) clearCache("projects");
  return result;
}

export async function updateProject(
  id: number, data: { path?: string; label?: string; token?: string; base_url?: string; tags?: string[]; description?: string }
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

export async function deleteAllProjects(): Promise<ApiResponse<{ deleted: number }>> {
  const result = await fetchJson<{ deleted: number }>("/v1/projects/all", { method: "DELETE" });
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

export async function createUser(data: { username: string; password: string; role?: string; allowed_tags?: string[] }): Promise<ApiResponse<AppUser>> {
  const result = await fetchJson<AppUser>("/v1/users", { method: "POST", body: JSON.stringify(data) });
  if (result.ok) clearCache("users");
  return result;
}

export async function updateUser(id: number, data: { role?: string; is_active?: boolean; allowed_tags?: string[] }): Promise<ApiResponse<AppUser>> {
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

export async function fetchBranches(projectIds?: number[], tag?: string, status?: string, dateFrom?: string, dateTo?: string, contributor?: string): Promise<ApiResponse<{ branches: Branch[]; summary: BranchSummary }>> {
  const parts: string[] = [];
  if (projectIds && projectIds.length > 0) parts.push(`project_ids=${projectIds.join(",")}`);
  if (tag) parts.push(`tag=${tag}`);
  if (status) parts.push(`status=${status}`);
  if (dateFrom) parts.push(`date_from=${dateFrom}`);
  if (dateTo) parts.push(`date_to=${dateTo}`);
  if (contributor) parts.push(`contributor=${encodeURIComponent(contributor)}`);
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

export async function fetchDependencies(projectIds?: number[], tags?: string, source?: string): Promise<ApiResponse<{ dependencies: DependencyAudit[]; summary: DependencySummary }>> {
  const parts: string[] = [];
  if (projectIds && projectIds.length > 0) parts.push(`project_ids=${projectIds.join(",")}`);
  if (tags) parts.push(`tags=${tags}`);
  if (source) parts.push(`source=${source}`);
  const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
  return fetchJson(`/v1/dependencies${qs}`);
}

export async function fetchContributorDirectory(): Promise<ApiResponse<{ id: number; display_name: string; emails: string[]; is_valid: boolean }[]>> {
  return fetchJson("/v1/contributor-directory");
}

export async function createContributorDirectoryEntry(data: { display_name: string; emails: string[] }): Promise<ApiResponse<any>> {
  return fetchJson("/v1/contributor-directory", { method: "POST", body: JSON.stringify(data) });
}

export async function updateContributorDirectoryEntry(id: number, data: { display_name?: string; emails?: string[]; is_valid?: boolean }): Promise<ApiResponse<any>> {
  return fetchJson(`/v1/contributor-directory/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function toggleContributorValid(id: number, isValid: boolean): Promise<ApiResponse<any>> {
  return fetchJson(`/v1/contributor-directory/${id}`, { method: "PUT", body: JSON.stringify({ is_valid: isValid }) });
}

export async function deleteContributorDirectoryEntry(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  return fetchJson(`/v1/contributor-directory/${id}`, { method: "DELETE" });
}

export async function importContributorDirectory(yaml: string): Promise<ApiResponse<{ imported: any[]; errors: any[]; total: number }>> {
  return fetchJson("/v1/contributor-directory/import", { method: "POST", body: JSON.stringify({ yaml }) });
}

export async function exportProjects(): Promise<ApiResponse<{ yaml: string }>> {
  return fetchJson("/v1/projects/export");
}

export async function exportContributorDirectory(): Promise<ApiResponse<{ yaml: string }>> {
  return fetchJson("/v1/contributor-directory/export");
}

export async function fetchFlatContributors(): Promise<ApiResponse<{ contributors: { name: string; email: string }[]; total: number }>> {
  return fetchJson("/v1/contributor-directory/flat-export");
}

export async function fetchDashboard(period: number = 30): Promise<ApiResponse<any>> {
  return fetchJson(`/v1/dashboard?period=${period}`);
}

export async function fetchMRAnalytics(projectIds?: number[], dateFrom?: string, dateTo?: string, contributors?: string, useMedian?: boolean): Promise<ApiResponse<any>> {
  const qs = new URLSearchParams();
  if (projectIds && projectIds.length > 0) qs.set("project_ids", projectIds.join(","));
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  if (contributors) qs.set("contributors", contributors);
  if (useMedian) qs.set("use_median", "1");
  const url = `/v1/mr-analytics${qs.toString() ? "?" + qs.toString() : ""}`;
  return fetchJson(url);
}

export async function collectMR(projectId: number): Promise<ApiResponse<any>> {
  return fetchJson("/v1/mr-analytics/collect", { method: "POST", body: JSON.stringify({ project_id: projectId }) });
}

export async function resolveContributor(email: string): Promise<ApiResponse<{ email: string; name: string }>> {
  return fetchJson(`/v1/contributors/resolve?email=${encodeURIComponent(email)}`);
}

export interface DeployReliabilityEntry {
  email: string;
  name: string;
  total_merged_mrs: number;
  total_pipelines: number;
  successful_pipelines: number;
  failed_pipelines: number;
  completed_pipelines: number;
  deploy_success_rate: number;
  pipeline_coverage_rate: number;
}

export async function fetchDeployReliability(projectIds?: number[], dateFrom?: string, dateTo?: string, contributors?: string): Promise<ApiResponse<DeployReliabilityEntry[]>> {
  const qs = new URLSearchParams();
  if (projectIds && projectIds.length > 0) qs.set("project_ids", projectIds.join(","));
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  if (contributors) qs.set("contributors", contributors);
  return fetchJson(`/v1/contributor-analytics/deploy-reliability${qs.toString() ? "?" + qs.toString() : ""}`);
}

export async function fetchContributorCommits(email: string, projectIds?: number[], dateFrom?: string, dateTo?: string): Promise<ApiResponse<{ commits: any[]; total: number }>> {
  const qs = new URLSearchParams({ email });
  if (projectIds && projectIds.length > 0) qs.set("project_ids", projectIds.join(","));
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  return fetchJson(`/v1/contributor-commits?${qs.toString()}`);
}

export async function fetchAuditLog(limit?: number, offset?: number, action?: string): Promise<ApiResponse<{ entries: any[]; total: number }>> {
  const qs = new URLSearchParams();
  if (limit) qs.set("limit", String(limit));
  if (offset) qs.set("offset", String(offset));
  if (action) qs.set("action", action);
  return fetchJson(`/v1/audit-log${qs.toString() ? "?" + qs.toString() : ""}`);
}

export async function fetchPersonalTokens(): Promise<ApiResponse<any[]>> {
  return fetchJson("/v1/personal-tokens");
}

export async function createPersonalToken(data: { base_url: string; token: string; label?: string }): Promise<ApiResponse<any>> {
  return fetchJson("/v1/personal-tokens", { method: "POST", body: JSON.stringify(data) });
}

export async function deletePersonalToken(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  return fetchJson(`/v1/personal-tokens/${id}`, { method: "DELETE" });
}

export async function scanProjects(tokenId: number): Promise<ApiResponse<{ added: number; skipped: number; total: number }>> {
  return fetchJson(`/v1/personal-tokens/${tokenId}/scan`, { method: "POST", body: "{}" });
}

export async function removeProjectToken(projectId: number): Promise<ApiResponse<{ cleared: boolean }>> {
  return fetchJson(`/v1/projects/${projectId}/remove-token`, { method: "PUT" });
}

export interface CollectJob {
  id: string;
  collector: string;
  project_ids: number[];
  started_at: number;
  current: number;
  total: number;
  status: "running" | "done" | "error" | "stuck";
  errors: { project_id: number; error: string }[];
}

export async function fetchCollectStatus(): Promise<ApiResponse<any>> {
  return fetchJson("/v1/scheduler/status");
}

export async function validateProjectTokens(projectIds: number[]): Promise<ApiResponse<{ total: number; valid: number; invalid: { project_id: number; label: string; error: string }[] }>> {
  return fetchJson("/v1/collect/validate-tokens", { method: "POST", body: JSON.stringify({ project_ids: projectIds }) });
}

export async function fetchBenchmark(tags: string[], dateFrom?: string, dateTo?: string): Promise<ApiResponse<any>> {
  const qs = new URLSearchParams({ tags: tags.join(",") });
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  return fetchJson(`/v1/benchmark?${qs.toString()}`);
}

export async function fetchContributorBenchmark(contributors: string[], projectIds?: number[], dateFrom?: string, dateTo?: string): Promise<ApiResponse<any>> {
  const qs = new URLSearchParams({ contributors: contributors.join(",") });
  if (projectIds && projectIds.length > 0) qs.set("project_ids", projectIds.join(","));
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  return fetchJson(`/v1/benchmark/contributors?${qs.toString()}`);
}

export async function startBatchCollect(collector: string, projectIds: number[], dateFrom?: string, dateTo?: string): Promise<ApiResponse<{ started: boolean; total: number }>> {
  const body: any = { collector, project_ids: projectIds };
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;
  return fetchJson<{ started: boolean; total: number }>("/v1/collect/batch", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchDoraMetrics(projectIds?: number[], environment?: string, dateFrom?: string, dateTo?: string): Promise<ApiResponse<any>> {
  const qs = new URLSearchParams();
  if (projectIds && projectIds.length > 0) qs.set("project_ids", projectIds.join(","));
  if (environment) qs.set("environment", environment);
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  return fetchJson(`/v1/dora-metrics${qs.toString() ? "?" + qs.toString() : ""}`);
}

export interface TimeEntry {
  id: number;
  contributor_email: string;
  hours: number;
  period_from: string;
  period_to: string;
  note: string;
  created_at: string;
}

export async function fetchTimeEntries(email?: string): Promise<ApiResponse<TimeEntry[]>> {
  const qs = new URLSearchParams();
  if (email) qs.set("email", email);
  return fetchJson<TimeEntry[]>(`/v1/time-entries${qs.toString() ? "?" + qs.toString() : ""}`);
}

export async function createTimeEntries(entries: { email: string; hours: number; period_from: string; period_to: string; note?: string }[]): Promise<ApiResponse<{ imported: any[]; errors: any[]; total: number }>> {
  return fetchJson("/v1/time-entries", { method: "POST", body: JSON.stringify({ entries }) });
}

export async function deleteTimeEntry(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  return fetchJson(`/v1/time-entries/${id}`, { method: "DELETE" });
}

export async function fetchTimeEntrySummary(): Promise<ApiResponse<any[]>> {
  return fetchJson("/v1/time-entries/summary");
}

export async function fetchTimeEntryTemplate(): Promise<ApiResponse<{ csv: string }>> {
  return fetchJson("/v1/time-entries/template");
}

export interface FilterPresetData {
  id: number;
  user_id: number;
  name: string;
  filters: any;
  relative_days_from: number | null;
  relative_days_to: number | null;
  created_at: string;
}

export async function fetchFilterPresets(): Promise<ApiResponse<FilterPresetData[]>> {
  return fetchJson("/v1/filter-presets");
}

export async function createFilterPreset(data: { name: string; filters: any; relative_days_from?: number; relative_days_to?: number }): Promise<ApiResponse<FilterPresetData>> {
  return fetchJson("/v1/filter-presets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateFilterPreset(id: number, name: string): Promise<ApiResponse<FilterPresetData>> {
  return fetchJson(`/v1/filter-presets/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function deleteFilterPreset(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  return fetchJson(`/v1/filter-presets/${id}`, { method: "DELETE" });
}

export async function fetchMetricWeights(): Promise<ApiResponse<Record<string, Record<string, number>>>> {
  return fetchJson("/v1/metric-weights");
}

export async function updateMetricWeights(metric: string, weights: Record<string, number>): Promise<ApiResponse<Record<string, number>>> {
  return fetchJson(`/v1/metric-weights/${metric}`, {
    method: "PUT",
    body: JSON.stringify(weights),
  });
}

export type ExecutiveReportData = any;

export async function fetchExecutiveReport(queryString?: string): Promise<ApiResponse<ExecutiveReportData>> {
  const qs = queryString ? `?${queryString}` : "";
  return fetchJson<ExecutiveReportData>(`/v1/executive-report${qs}`);
}

export async function fetchLineageFlow(): Promise<ApiResponse<any>> {
  return fetchJson("/v1/data-lineage/flow");
}

export async function fetchLineageTableStats(): Promise<ApiResponse<any>> {
  return fetchJson("/v1/data-lineage/stats");
}

export async function fetchLineageTableDetail(name: string): Promise<ApiResponse<any>> {
  return fetchJson(`/v1/data-lineage/table/${encodeURIComponent(name)}`);
}

export async function fetchCollectionJobs(): Promise<ApiResponse<any>> {
  return fetchJson("/v1/data-collection/jobs");
}

export async function fetchCollectionStats(): Promise<ApiResponse<any>> {
  return fetchJson("/v1/data-collection/stats");
}

export async function fetchCollectionHealth(): Promise<ApiResponse<any>> {
  return fetchJson("/v1/data-collection/health");
}

export async function fetchLineageMetadata(): Promise<ApiResponse<any>> {
  return fetchJson("/v1/data-lineage/metadata");
}

export async function updateLineageMetadata(entityType: string, entityName: string, metadata: any): Promise<ApiResponse<any>> {
  return fetchJson("/v1/data-lineage/metadata", {
    method: "POST",
    body: JSON.stringify({ entity_type: entityType, entity_name: entityName, metadata }),
  });
}

export async function deleteLineageMetadata(entityType: string, entityName: string): Promise<ApiResponse<any>> {
  return fetchJson(`/v1/data-lineage/metadata/${encodeURIComponent(entityType)}/${encodeURIComponent(entityName)}`, {
    method: "DELETE",
  });
}

export async function triggerDagsterCollect(): Promise<ApiResponse<any>> {
  return fetchJson("/v1/dagster/trigger", { method: "POST", body: "{}" });
}

export async function fetchRedFlags(
  projectIds?: number[], dateFrom?: string, dateTo?: string
): Promise<ApiResponse<import("../types/analytics").RedFlagEntry>> {
  const params = new URLSearchParams();
  if (projectIds && projectIds.length > 0) params.set("project_ids", projectIds.join(","));
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString();
  return cachedGet(`/v1/red-flags${qs ? "?" + qs : ""}`, `red-flags:${qs}`);
}
