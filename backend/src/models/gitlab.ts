export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string | null;
  language: string | null;
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committed_date: string;
  message: string;
}

export interface GitLabCommitDiff {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

export interface GitLabTreeItem {
  id: string;
  name: string;
  type: "blob" | "tree";
  path: string;
  size?: number;
}

export interface GitLabLink {
  url: string;
  rel: string;
}
