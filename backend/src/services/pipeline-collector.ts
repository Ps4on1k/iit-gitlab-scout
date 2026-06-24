import { getPool } from "../db/pool.js";
import { decrypt } from "../utils/crypto.js";
import { GitLabClient } from "./gitlab-client.js";

interface GitLabPipeline {
  id: number;
  status: string;
  ref: string;
  source: string;
  duration: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  user: { name: string; username: string } | null;
}

export async function collectPipelines(projectId: number): Promise<{ total: number; success: number; failed: number; running: number }> {
  const pool = getPool();
  const projResult = await pool.query(
    "SELECT id, path, token_encrypted, base_url FROM projects WHERE id = $1",
    [projectId]
  );
  const proj = projResult.rows[0];
  if (!proj) throw new Error(`Project ${projectId} not found`);

  const token = decrypt(proj.token_encrypted);
  const client = new GitLabClient({ token, baseUrl: proj.base_url });

  const pipelines = await client.requestPaginated<GitLabPipeline>(
    `/projects/${encodeURIComponent(proj.path)}/pipelines?per_page=100&order_by=id&sort=desc`
  );

  let success = 0, failed = 0, running = 0;

  for (const p of pipelines) {
    if (p.status === "success") success++;
    else if (p.status === "failed") failed++;
    else if (p.status === "running") running++;

    await pool.query(
      `INSERT INTO project_pipelines (project_id, gitlab_id, status, ref, source, duration, created_at, updated_at, finished_at, user_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (project_id, gitlab_id) DO UPDATE SET
         status = EXCLUDED.status, ref = EXCLUDED.ref, source = EXCLUDED.source,
         duration = EXCLUDED.duration, updated_at = EXCLUDED.updated_at,
         finished_at = EXCLUDED.finished_at, user_name = EXCLUDED.user_name`,
      [
        projectId, p.id, p.status, p.ref || "", p.source || "",
        p.duration, p.created_at, p.updated_at, p.finished_at,
        p.user?.name || "",
      ]
    );
  }

  return { total: pipelines.length, success, failed, running };
}
