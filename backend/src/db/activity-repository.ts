import { getPool } from "./pool.js";

export interface ActivityFilters {
  project_ids?: number[];
  tag?: string[];
  date_from?: string;
  date_to?: string;
  group_by?: "day" | "week";
  contributor?: string;
}

export interface ActivityDay {
  date: string;
  commits: number;
  merge_requests: number;
  pipelines: number;
}

export async function getActivity(filters: ActivityFilters): Promise<ActivityDay[]> {
  const pool = getPool();

  // Get project IDs based on access control
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.project_ids && filters.project_ids.length > 0) {
    conditions.push(`pa.project_id = ANY($${idx++})`);
    params.push(filters.project_ids);
  }
  if (filters.tag && filters.tag.length > 0) {
    conditions.push(`p.tags && $${idx++}`);
    params.push(filters.tag);
  }
  if (filters.date_from) {
    conditions.push(`pa.date >= $${idx++}`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`pa.date <= $${idx++}`);
    params.push(filters.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const truncExpr = filters.group_by === "week" ? "DATE_TRUNC('week', pa.date)" : "pa.date";

  // Get MR and pipeline data from project_activity
  const activityResult = await pool.query(
    `SELECT ${truncExpr}::text as date,
            SUM(pa.merge_requests) as merge_requests,
            SUM(pa.pipelines) as pipelines
     FROM project_activity pa
     JOIN projects p ON p.id = pa.project_id
     ${where}
     GROUP BY ${truncExpr}
     ORDER BY date`,
    params
  );

  // Get unique commits from commits table (normalized)
  const commitConditions: string[] = [];
  const commitParams: any[] = [];
  let cIdx = 1;

  if (filters.project_ids && filters.project_ids.length > 0) {
    commitConditions.push(`c.project_id = ANY($${cIdx++})`);
    commitParams.push(filters.project_ids);
  }
  if (filters.date_from) {
    commitConditions.push(`c.committed_date >= $${cIdx++}`);
    commitParams.push(filters.date_from);
  }
  if (filters.date_to) {
    commitConditions.push(`c.committed_date <= $${cIdx++}`);
    commitParams.push(filters.date_to + "T23:59:59Z");
  }
  if (filters.contributor) {
    commitConditions.push(`(c.author_email ILIKE $${cIdx} OR c.author_name ILIKE $${cIdx})`);
    commitParams.push(`%${filters.contributor}%`);
    cIdx++;
  }

  const commitWhere = commitConditions.length > 0 ? `WHERE ${commitConditions.join(" AND ")}` : "";
  const commitTruncExpr = filters.group_by === "week" ? "DATE_TRUNC('week', c.committed_date)" : "c.committed_date::date";

  const commitResult = await pool.query(
    `SELECT ${commitTruncExpr}::text as date, COUNT(*)::int as commits
     FROM commits c
     ${commitWhere}
     GROUP BY ${commitTruncExpr}
     ORDER BY date`,
    commitParams
  );

  // Merge activity (MR/pipelines) with unique commits
  const dateMap = new Map<string, ActivityDay>();

  for (const r of activityResult.rows) {
    dateMap.set(r.date, {
      date: r.date,
      commits: 0,
      merge_requests: Number(r.merge_requests),
      pipelines: Number(r.pipelines),
    });
  }

  for (const r of commitResult.rows) {
    const existing = dateMap.get(r.date);
    if (existing) {
      existing.commits = r.commits;
    } else {
      dateMap.set(r.date, { date: r.date, commits: r.commits, merge_requests: 0, pipelines: 0 });
    }
  }

  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
