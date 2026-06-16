import { getPool } from "../db/pool.js";
import { decrypt } from "../utils/crypto.js";
import { GitLabClient } from "./gitlab-client.js";

interface GitLabBranch {
  name: string;
  default: boolean;
  merged: boolean;
  protected: boolean;
  commit?: { committer_date: string; author_name: string };
}

export async function collectBranches(projectId: number): Promise<{ total: number; active: number; stale: number; merged: number }> {
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
  const now = new Date();
  const staleThreshold = 90 * 24 * 60 * 60 * 1000; // 90 days

  for (const branch of branches) {
    const lastDate = branch.commit?.committer_date || null;
    const isStale = lastDate ? (now.getTime() - new Date(lastDate).getTime()) > staleThreshold : true;

    if (branch.merged) merged++;
    else if (isStale) stale++;
    else active++;

    await pool.query(
      `INSERT INTO project_branches (project_id, name, "default", merged, protected, last_commit_date, last_commit_author)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [projectId, branch.name, branch.default, branch.merged, branch.protected, lastDate, branch.commit?.author_name || ""]
    );
  }

  return { total: branches.length, active, stale, merged };
}
