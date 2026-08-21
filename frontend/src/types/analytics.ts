export interface Branch {
  id: number;
  project_id: number;
  project_path: string;
  project_label: string;
  project_tags: string[];
  name: string;
  default: boolean;
  merged: boolean;
  protected: boolean;
  last_commit_date: string | null;
  last_commit_author: string;
  last_commit_author_email: string;
  last_commit_message: string;
  first_commit_date: string | null;
  can_push: boolean | null;
  last_commit_additions: number;
  last_commit_deletions: number;
  display_author: string;
}

export interface BranchPerProject {
  project_id: number;
  label: string;
  tags: string[];
  total: number;
  active: number;
  stale: number;
  merged: number;
}

export interface BranchSummary {
  total: number;
  active: number;
  stale: number;
  merged: number;
  protected: number;
  avgDaysSinceCommit: number;
  perProject: BranchPerProject[];
}

export interface Issue {
  id: number;
  project_id: number;
  project_path: string;
  project_label: string;
  project_tags: string[];
  gitlab_iid: number;
  title: string;
  state: string;
  author_email: string;
  assignee_email: string;
  labels: string;
  created_at: string;
  closed_at: string | null;
  due_date: string | null;
  weight: number | null;
}

export interface IssueSummary {
  total: number;
  opened: number;
  closed: number;
  avg_days_to_close: number;
}

export interface DependencyAudit {
  id: number;
  project_id: number;
  project_path: string;
  project_label: string;
  project_tags: string[];
  name: string;
  current_version: string;
  latest_version: string;
  is_outdated: boolean;
  license: string;
  source: string;
  collected_at: string;
}

export interface DependencySummary {
  total: number;
  outdated: number;
  by_source: Record<string, number>;
}

export interface ProjectRedFlags {
  stale_branches_pct: number;
  pipeline_failure_rate: number;
  mr_without_review_pct: number;
  long_living_mrs: number;
  deploy_frequency_monthly: number;
  has_deployments: boolean;
  total_flags: number;
}

export interface ContributorRedFlag {
  author_email: string;
  author_name: string;
  total_commits: number;
  night_commits: number;
  night_ratio: number;
  night_commits_by_hour: Record<string, number>;
  missing_yellow_zone_days: number;
  total_active_days: number;
  yellow_zone_ratio: number;
  bus_factor_pct: number;
  large_mrs: number;
  direct_commits: number;
  disappeared: boolean;
  churn_pct: number;
  deploy_success_rate: number;
  pipeline_coverage_rate: number;
  weekend_commits: number;
  weekend_ratio: number;
  flag_score: number;
}

export interface RedFlagEntry {
  project: ProjectRedFlags;
  contributors: ContributorRedFlag[];
  summary: {
    project_flags: number;
    contributor_flags: number;
    critical_count: number;
    warning_count: number;
  };
}
