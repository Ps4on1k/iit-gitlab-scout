export interface ContributorStats {
  author_name: string;
  author_email: string;
  total_commits: number;
  frequency: Record<string, number>;
  first_commit_date: string;
  last_commit_date: string;
}

export interface CommitWithDiff {
  commit: import("./gitlab.js").GitLabCommit;
  diffs: import("./gitlab.js").GitLabCommitDiff[];
}

export interface Dependency {
  name: string;
  version: string;
}

export interface StackInfo {
  language: string | null;
  dependency_files: DependencyFile[];
  total_dependencies: number;
}

export interface DependencyFile {
  file_path: string;
  file_type: string;
  dependencies: Dependency[];
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
