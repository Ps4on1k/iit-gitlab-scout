import { getPool } from "./pool.js";
import type {
  BatchStatsResponse,
  ProjectStats,
} from "../models/responses.js";

export async function saveAnalysisRun(
  data: BatchStatsResponse
): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const runResult = await client.query(
      "INSERT INTO analysis_runs (projects_count) VALUES ($1) RETURNING id",
      [data.projects.length]
    );
    const runId = runResult.rows[0].id;

    for (const proj of data.projects) {
      const projResult = await client.query(
        `INSERT INTO project_results
         (run_id, project_path, label, language, total_dependencies, contributors_count, error, raw_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          runId,
          proj.project,
          proj.label,
          proj.stack.language,
          proj.stack.total_dependencies,
          proj.contributors.length,
          proj.error || null,
          JSON.stringify(proj),
        ]
      );
      const resultId = projResult.rows[0].id;

      for (const contrib of proj.contributors) {
        await client.query(
          `INSERT INTO contributors
           (result_id, author_name, author_email, total_commits, first_commit_date, last_commit_date, frequency)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            resultId,
            contrib.author_name,
            contrib.author_email,
            contrib.total_commits,
            contrib.first_commit_date,
            contrib.last_commit_date,
            JSON.stringify(contrib.frequency),
          ]
        );
      }

      for (const depFile of proj.stack.dependency_files) {
        await client.query(
          `INSERT INTO dependency_files (result_id, file_path, file_type, dependencies)
           VALUES ($1, $2, $3, $4)`,
          [resultId, depFile.file_path, depFile.file_type, JSON.stringify(depFile.dependencies)]
        );
      }
    }

    await client.query("COMMIT");
    return runId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getLatestRun(): Promise<{
  id: number;
  analyzed_at: string;
  projects_count: number;
} | null> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT id, analyzed_at, projects_count FROM analysis_runs ORDER BY id DESC LIMIT 1"
  );
  return result.rows[0] ?? null;
}

export async function getRunProjects(
  runId: number
): Promise<ProjectStats[]> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT raw_json FROM project_results WHERE run_id = $1",
    [runId]
  );
  return result.rows.map((row) => row.raw_json as ProjectStats);
}

export async function getProjectHistory(
  projectPath: string,
  limit = 10
): Promise<
  { run_id: number; analyzed_at: string; total_dependencies: number; contributors_count: number }[]
> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT pr.run_id, ar.analyzed_at, pr.total_dependencies, pr.contributors_count
     FROM project_results pr
     JOIN analysis_runs ar ON ar.id = pr.run_id
     WHERE pr.project_path = $1
     ORDER BY ar.analyzed_at DESC
     LIMIT $2`,
    [projectPath, limit]
  );
  return result.rows;
}
