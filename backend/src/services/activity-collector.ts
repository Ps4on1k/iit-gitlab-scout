import { getPool } from "../db/pool.js";
import { decrypt } from "../utils/crypto.js";
import { GitLabClient } from "./gitlab-client.js";

interface GitLabEvent {
  action_name?: string;
  created_at: string;
  push_data?: { commit_count: number };
  target_type?: string;
}

interface GitLabPipeline {
  created_at: string;
  status: string;
}

export interface ActivityDay {
  date: string;
  commits: number;
  merge_requests: number;
  pipelines: number;
}

export async function collectActivity(projectId: number, since?: string, until?: string): Promise<ActivityDay[]> {
  const pool = getPool();
  const projResult = await pool.query(
    "SELECT id, path, token_encrypted, base_url FROM projects WHERE id = $1",
    [projectId]
  );
  const proj = projResult.rows[0];
  if (!proj) throw new Error(`Project ${projectId} not found`);

  const token = decrypt(proj.token_encrypted);
  const client = new GitLabClient({ token, baseUrl: proj.base_url });

  const sinceDate = since || "2020-01-01";
  const untilDate = until || new Date().toISOString().slice(0, 10);

  // Collect push events (commits)
  const commitsByDay: Record<string, number> = {};
  try {
    const events = await client.requestPaginated<GitLabEvent>(
      `/projects/${encodeURIComponent(proj.path)}/events?action=pushed&after=${sinceDate}&before=${untilDate}&per_page=100`
    );
    for (const event of events) {
      if (event.push_data?.commit_count) {
        const day = event.created_at.slice(0, 10);
        commitsByDay[day] = (commitsByDay[day] || 0) + event.push_data.commit_count;
      }
    }
  } catch {
    // events unavailable
  }

  // Collect merge requests
  const mrsByDay: Record<string, number> = {};
  try {
    const mrs = await client.requestPaginated<any>(
      `/projects/${encodeURIComponent(proj.path)}/merge_requests?state=all&updated_after=${sinceDate}T00:00:00Z&updated_before=${untilDate}T23:59:59Z&per_page=100`
    );
    for (const mr of mrs) {
      const day = (mr.merged_at || mr.created_at || "").slice(0, 10);
      if (day && day >= sinceDate && day <= untilDate) {
        mrsByDay[day] = (mrsByDay[day] || 0) + 1;
      }
    }
  } catch {
    // merge_requests unavailable
  }

  // Collect pipelines
  const pipelinesByDay: Record<string, number> = {};
  try {
    const pipelines = await client.requestPaginated<GitLabPipeline>(
      `/projects/${encodeURIComponent(proj.path)}/pipelines?updated_after=${sinceDate}T00:00:00Z&updated_before=${untilDate}T23:59:59Z&per_page=100`
    );
    for (const p of pipelines) {
      const day = (p.created_at || "").slice(0, 10);
      if (day && day >= sinceDate && day <= untilDate) {
        pipelinesByDay[day] = (pipelinesByDay[day] || 0) + 1;
      }
    }
  } catch {
    // pipelines unavailable
  }

  // Merge all dates
  const allDays = new Set<string>([
    ...Object.keys(commitsByDay),
    ...Object.keys(mrsByDay),
    ...Object.keys(pipelinesByDay),
  ]);

  const results: ActivityDay[] = [];
  for (const day of Array.from(allDays).sort()) {
    results.push({
      date: day,
      commits: commitsByDay[day] || 0,
      merge_requests: mrsByDay[day] || 0,
      pipelines: pipelinesByDay[day] || 0,
    });
  }

  // Save to DB
  await pool.query("DELETE FROM project_activity WHERE project_id = $1 AND date >= $2 AND date <= $3", [projectId, sinceDate, untilDate]);
  for (const row of results) {
    await pool.query(
      `INSERT INTO project_activity (project_id, date, commits, merge_requests, pipelines)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, date) DO UPDATE SET
         commits = EXCLUDED.commits, merge_requests = EXCLUDED.merge_requests,
         pipelines = EXCLUDED.pipelines, collected_at = now()`,
      [projectId, row.date, row.commits, row.merge_requests, row.pipelines]
    );
  }

  return results;
}
