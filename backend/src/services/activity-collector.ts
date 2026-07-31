import { getPool } from "../db/pool.js";
import { resolveProjectToken } from "../utils/project-token.js";

export interface ActivityDay {
  date: string;
  commits: number;
  merge_requests: number;
  pipelines: number;
}

export async function collectActivity(projectId: number, since?: string, until?: string): Promise<ActivityDay[]> {
  const pool = getPool();
  await resolveProjectToken(projectId); // Ensure project exists

  const sinceDate = since || "2020-01-01";
  const untilDate = until || new Date().toISOString().slice(0, 10);

  // Aggregate from tables (same approach as Dagster gitlab_activity)
  const activityResult = await pool.query<{
    date: string;
    commits: string;
    merge_requests: string;
    pipelines: string;
  }>(
    `WITH commit_activity AS (
       SELECT committed_date::date as date, COUNT(*)::int as commits
       FROM commits
       WHERE project_id = $1 AND committed_date >= $2 AND committed_date <= $3
       GROUP BY committed_date::date
     ),
     mr_activity AS (
       SELECT created_at::date as date, COUNT(*)::int as merge_requests
       FROM project_merge_requests
       WHERE project_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY created_at::date
     ),
     pipeline_activity AS (
       SELECT created_at::date as date, COUNT(*)::int as pipelines
       FROM project_pipelines
       WHERE project_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY created_at::date
     )
     SELECT
       COALESCE(c.date, mr.date, p.date) as date,
       COALESCE(c.commits, 0)::int as commits,
       COALESCE(mr.merge_requests, 0)::int as merge_requests,
       COALESCE(p.pipelines, 0)::int as pipelines
     FROM commit_activity c
     FULL OUTER JOIN mr_activity mr ON c.date = mr.date
     FULL OUTER JOIN pipeline_activity p ON COALESCE(c.date, mr.date) = p.date
     ORDER BY date`,
    [projectId, sinceDate, untilDate + "T23:59:59Z"]
  );

  const results: ActivityDay[] = activityResult.rows.map((row) => ({
    date: row.date,
    commits: Number(row.commits),
    merge_requests: Number(row.merge_requests),
    pipelines: Number(row.pipelines),
  }));

  // Save to DB
  await pool.query(
    "DELETE FROM project_activity WHERE project_id = $1 AND date >= $2 AND date <= $3",
    [projectId, sinceDate, untilDate]
  );
  if (results.length > 0) {
    const { batchInsert } = await import("../utils/batch.js");
    const columns = ["project_id", "date", "commits", "merge_requests", "pipelines"];
    const rows = results.map((row) => [projectId, row.date, row.commits, row.merge_requests, row.pipelines]);
    await batchInsert("project_activity", columns, rows);
  }

  return results;
}
