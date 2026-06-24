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

    let duration = p.duration;
    if (duration === null || duration === undefined) {
      if (p.finished_at && p.created_at) {
        duration = Math.round((new Date(p.finished_at).getTime() - new Date(p.created_at).getTime()) / 1000);
      }
    }

    await pool.query(
      `INSERT INTO project_pipelines (project_id, gitlab_id, status, ref, source, duration, created_at, updated_at, finished_at, user_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (project_id, gitlab_id) DO UPDATE SET
         status = EXCLUDED.status, ref = EXCLUDED.ref, source = EXCLUDED.source,
         duration = EXCLUDED.duration, updated_at = EXCLUDED.updated_at,
         finished_at = EXCLUDED.finished_at, user_name = EXCLUDED.user_name`,
      [
        projectId, p.id, p.status, p.ref || "", p.source || "",
        duration, p.created_at, p.updated_at, p.finished_at,
        p.user?.name || "",
      ]
    );
  }

  // Estimate duration for pipelines without duration using next pipeline on same ref
  await pool.query(`
    WITH ranked AS (
      SELECT id, ref, created_at, status, duration,
             LEAD(created_at) OVER (PARTITION BY project_id, ref ORDER BY created_at) as next_created
      FROM project_pipelines
      WHERE project_id = $1 AND duration IS NULL AND status IN ('success', 'failed')
    )
    UPDATE project_pipelines pp
    SET duration = GREATEST(1, EXTRACT(EPOCH FROM (r.next_created - r.created_at))::int)
    FROM ranked r
    WHERE pp.id = r.id AND r.next_created IS NOT NULL
      AND EXTRACT(EPOCH FROM (r.next_created - r.created_at)) > 0
      AND EXTRACT(EPOCH FROM (r.next_created - r.created_at)) < 7200
  `, [projectId]);

  // For the remaining pipelines without duration, estimate average from same-ref completed pipelines
  await pool.query(`
    WITH ref_avg AS (
      SELECT ref, AVG(duration)::int as avg_dur
      FROM project_pipelines
      WHERE project_id = $1 AND duration IS NOT NULL AND status IN ('success', 'failed')
      GROUP BY ref
    )
    UPDATE project_pipelines pp
    SET duration = ra.avg_dur
    FROM ref_avg ra
    WHERE pp.project_id = $1 AND pp.ref = ra.ref AND pp.duration IS NULL AND pp.status IN ('success', 'failed')
  `, [projectId]);

  return { total: pipelines.length, success, failed, running };
}
