export interface ContributorStats {
  author_name: string;
  author_email: string;
  total_commits: number;
  frequency: Record<string, number>;
  first_commit_date: string;
  last_commit_date: string;
}

export interface CommitDiff {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

export interface Dependency {
  name: string;
  version: string;
}

export interface DependencyFile {
  file_path: string;
  file_type: string;
  dependencies: Dependency[];
}

export interface StackInfo {
  language: string | null;
  dependency_files: DependencyFile[];
  total_dependencies: number;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ProjectStats {
  project: string;
  label: string;
  contributors: ContributorStats[];
  stack: StackInfo;
  error?: string;
}

export interface BatchStatsResponse {
  projects: ProjectStats[];
  analyzed_at: string;
}

export type Role = "admin" | "user" | "manager";

export interface User {
  id: number;
  username: string;
  role: Role;
  allowed_tags: string[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ProjectConfig {
  id: number;
  path: string;
  label: string;
  tag: string;
  base_url: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  allowed_tags: string[];
  created_at: string;
}

export interface DbContributor {
  id: number;
  project_id: number;
  author_email: string;
  author_name: string;
  total_commits: number;
  total_additions: number;
  total_deletions: number;
  total_changes: number;
  first_commit_date: string;
  last_commit_date: string;
  frequency: Record<string, number>;
  updated_at: string;
}

export interface CollectResult {
  project_id: number;
  project_path: string;
  new_commits: number;
  skipped_duplicates: number;
  total_processed: number;
}

export interface ContributorMetrics {
  unique_contributors: number;
  total_commits: number;
  total_additions: number;
  total_deletions: number;
  total_changes: number;
  period_start: string;
  period_end: string;
  calendar_days: number;
  avg_commits_per_day: number;
  avg_changes_per_day: number;
  avg_changes_per_commit: number;
}

export interface HeatmapData {
  by_project: Record<string, Record<string, number>>;
  by_contributor: Record<string, Record<string, number>>;
  project_contributors: Record<string, string[]>;
  by_project_contributor: Record<string, Record<string, Record<string, number>>>;
}

export interface ContributorFilters {
  project_id?: number;
  project_ids?: number[];
  date_from?: string;
  date_to?: string;
}
