import { getPool } from "../db/pool.js";
import { decrypt } from "../utils/crypto.js";
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
}

interface GitLabApproval {
  approvals_left: number;
  approved_by: { user: { username: string; name?: string } }[];
}

export async function collectMergeRequests(projectId: number): Promise<{ total: number; merged: number; opened: number; closed: number }> {
  const pool = getPool();
  const projResult = await pool.query("SELECT id, path, token_encrypted, base_url FROM projects WHERE id = $1", [projectId]);
  const proj = projResult.rows[0];
  if (!proj) throw new Error(`Project ${projectId} not found`);

  const token = proj.token_encrypted ? decrypt(proj.token_encrypted) : "";
  const client = new GitLabClient({ token, baseUrl: proj.base_url });

  const mrs = await client.requestPaginated<GitLabMR>(
    `/projects/${encodeURIComponent(proj.path)}/merge_requests?state=all&per_page=100&order_by=created_at&sort=desc`
  );

  await pool.query("DELETE FROM project_merge_requests WHERE project_id = $1", [projectId]);

  let merged = 0, opened = 0, closed = 0;

  for (const mr of mrs) {
    if (mr.state === "merged") merged++;
    else if (mr.state === "opened") opened++;
    else closed++;

    let approvals = 0;
    let reviewerNames: string[] = [];
    try {
      const approval = await client.request<GitLabApproval>(
        `/projects/${encodeURIComponent(proj.path)}/merge_requests/${mr.iid}/approvals`
      );
      if (approval) {
        approvals = approval.approved_by?.length || 0;
        reviewerNames = approval.approved_by?.map((a: { user: { username: string; name?: string } }) => a.user.name || a.user.username) || [];
      }
    } catch {}

    const changesCount = mr.changes_count ? parseInt(mr.changes_count, 10) || 0 : 0;

    await pool.query(
      `INSERT INTO project_merge_requests (project_id, gitlab_iid, title, state, author_name, author_email, source_branch, target_branch, created_at, updated_at, merged_at, closed_at, merged_by, reviewers, approvals, changes_count, comments_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (project_id, gitlab_iid) DO UPDATE SET
         title=$3, state=$4, author_name=$5, author_email=$6, source_branch=$7, target_branch=$8,
         updated_at=$10, merged_at=$11, closed_at=$12, merged_by=$13, reviewers=$14, approvals=$15, changes_count=$16, comments_count=$17`,
      [
        projectId, mr.iid, mr.title, mr.state,
        mr.author?.name || mr.author?.username || "", mr.author?.email || mr.author?.username || "",
        mr.source_branch, mr.target_branch,
        mr.created_at, mr.updated_at, mr.merged_at, mr.closed_at,
        mr.merged_by?.username || "", reviewerNames,
        approvals, changesCount, mr.user_notes_count || 0,
      ]
    );
  }

  return { total: mrs.length, merged, opened, closed };
}
