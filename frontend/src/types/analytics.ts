export interface Branch {
  id: number;
  project_id: number;
  project_path: string;
  project_label: string;
  project_tag: string;
  name: string;
  default: boolean;
  merged: boolean;
  protected: boolean;
  last_commit_date: string | null;
  last_commit_author: string;
}

export interface BranchSummary {
  total: number;
  active: number;
  stale: number;
  merged: number;
}

export interface Issue {
  id: number;
  project_id: number;
  project_path: string;
  project_label: string;
  project_tag: string;
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
  project_tag: string;
  name: string;
  current_version: string;
  latest_version: string;
  is_outdated: boolean;
  license: string;
  source: string;
}

export interface DependencySummary {
  total: number;
  outdated: number;
  by_source: Record<string, number>;
}
