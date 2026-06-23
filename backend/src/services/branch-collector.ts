import { getPool } from "../db/pool.js";
import { decrypt } from "../utils/crypto.js";
import { GitLabClient } from "./gitlab-client.js";

interface GitLabBranch {
  name: string;
  default: boolean;
  merged: boolean;
  protected: boolean;
  can_push?: boolean;
  commit?: {
    id: string;
    committed_date: string;
    authored_date: string;
    author_name: string;
    author_email: string;
    message: string;
  };
}

interface GitLabCommitDetail {
  stats?: { additions: number; deletions: number; total: number };
}

export async function collectBranches(projectId: number): Promise<{ total: number; active: number; stale: number; merged: number; protected: number; unprotected: number }> {
  const pool = getPool();
  const projResult = await pool.query(
    "SELECT id, path, token_encrypted, base_url FROM projects WHERE id = $1",
    [projectId]
  );
  const proj = projResult.rows[0];
  if (!proj) throw new Error(`Project ${projectId} not found`);

  const token = decrypt(proj.token_encrypted);
  const client = new GitLabClient({ token, baseUrl: proj.base_url });

  const branches = await client.requestPaginated<GitLabBranch>(
    `/projects/${encodeURIComponent(proj.path)}/repository/branches?per_page=100`
  );

  await pool.query("DELETE FROM project_branches WHERE project_id = $1", [projectId]);

  let active = 0;
  let stale = 0;
  let merged = 0;
  let protectedCount = 0;
  let unprotected = 0;
  const now = new Date();
  const staleThreshold = 90 * 24 * 60 * 60 * 1000;

  for (const branch of branches) {
    const lastDate = branch.commit?.committed_date || null;
    const isStale = lastDate ? (now.getTime() - new Date(lastDate).getTime()) > staleThreshold : true;

    if (branch.merged) merged++;
    else if (isStale) stale++;
    else active++;

    if (branch.protected) protectedCount++;
    else unprotected++;

    let additions = 0;
    let deletions = 0;
    if (branch.commit?.id) {
      try {
        const detail = await client.request<GitLabCommitDetail>(
          `/projects/${encodeURIComponent(proj.path)}/repository/commits/${branch.commit.id}`
        );
        additions = detail.stats?.additions || 0;
        deletions = detail.stats?.deletions || 0;
      } catch { /* stats unavailable */ }
    }

    await pool.query(
      `INSERT INTO project_branches (project_id, name, "default", merged, protected, last_commit_date, last_commit_author, last_commit_author_email, last_commit_message, first_commit_date, can_push, last_commit_additions, last_commit_deletions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        projectId, branch.name, branch.default, branch.merged, branch.protected,
        lastDate, branch.commit?.author_name || "",
        branch.commit?.author_email || "",
        branch.commit?.message?.slice(0, 500) || "",
        branch.commit?.authored_date || null,
        branch.can_push ?? null,
        additions, deletions,
      ]
    );
  }

  return { total: branches.length, active, stale, merged, protected: protectedCount, unprotected };
}
