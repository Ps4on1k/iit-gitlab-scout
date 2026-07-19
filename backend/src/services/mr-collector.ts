import { getPool } from "../db/pool.js";
import { resolveProjectToken } from "../utils/project-token.js";
import { GitLabClient } from "./gitlab-client.js";

interface GitLabMR {
  iid: number;
  title: string;
  state: string;
  author: { username: string; name?: string; email?: string };
  source_branch: string;
  target_branch: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  merged_by: { username?: string } | null;
  user_notes_count: number;
  changes_count?: string;
  reviewers?: { username: string; name?: string }[];
}

export async function collectMergeRequests(projectId: number): Promise<{ total: number; merged: number; opened: number; closed: number }> {
  const pool = getPool();
  const { token, baseUrl, path: projectPath } = await resolveProjectToken(projectId);
  const client = new GitLabClient({ token, baseUrl });

  const mrs = await client.requestPaginated<GitLabMR>(
    `/projects/${encodeURIComponent(projectPath)}/merge_requests?state=all&per_page=100&order_by=created_at&sort=desc`
  );

  await pool.query("DELETE FROM project_merge_requests WHERE project_id = $1", [projectId]);

  let merged = 0, opened = 0, closed = 0;
  const mrRows: any[][] = [];

  for (const mr of mrs) {
    if (mr.state === "merged") merged++;
    else if (mr.state === "opened") opened++;
    else closed++;

    const reviewerNames = (mr.reviewers || []).map((r) => r.name || r.username);
    const approvals = reviewerNames.length;

    const changesCount = mr.changes_count ? parseInt(mr.changes_count, 10) || 0 : 0;

    mrRows.push([
      projectId, mr.iid, mr.title, mr.state,
      mr.author?.name || mr.author?.username || "", mr.author?.email || mr.author?.username || "",
      mr.source_branch, mr.target_branch,
      mr.created_at, mr.updated_at, mr.merged_at, mr.closed_at,
      mr.merged_by?.username || "", reviewerNames,
      approvals, changesCount, mr.user_notes_count || 0,
    ]);
  }

  if (mrRows.length > 0) {
    const { batchInsert } = await import("../utils/batch.js");
    const columns = ["project_id", "gitlab_iid", "title", "state", "author_name", "author_email", "source_branch", "target_branch", "created_at", "updated_at", "merged_at", "closed_at", "merged_by", "reviewers", "approvals", "changes_count", "comments_count"];
    await batchInsert("project_merge_requests", columns, mrRows, `(project_id, gitlab_iid) DO UPDATE SET
      title=EXCLUDED.title, state=EXCLUDED.state, author_name=EXCLUDED.author_name, author_email=EXCLUDED.author_email,
      source_branch=EXCLUDED.source_branch, target_branch=EXCLUDED.target_branch,
      updated_at=EXCLUDED.updated_at, merged_at=EXCLUDED.merged_at, closed_at=EXCLUDED.closed_at,
      merged_by=EXCLUDED.merged_by, reviewers=EXCLUDED.reviewers, approvals=EXCLUDED.approvals,
      changes_count=EXCLUDED.changes_count, comments_count=EXCLUDED.comments_count`);
  }

  return { total: mrs.length, merged, opened, closed };
}
