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

  if (filters.contributor) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.project_ids && filters.project_ids.length > 0) {
      conditions.push(`c.project_id = ANY($${idx++})`);
      params.push(filters.project_ids);
    }
    if (filters.tag && filters.tag.length > 0) {
      conditions.push(`p.tags &&($${idx++})`);
      params.push(filters.tag);
    }
    if (filters.date_from) {
      conditions.push(`c.committed_date >= $${idx++}`);
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      conditions.push(`c.committed_date <= $${idx++}`);
      params.push(filters.date_to + "T23:59:59Z");
    }
    conditions.push(`(c.author_name ILIKE $${idx} OR c.author_email ILIKE $${idx})`);
    params.push(`%${filters.contributor}%`);
    idx++;

    const where = `WHERE ${conditions.join(" AND ")}`;
    const truncExpr = filters.group_by === "week" ? "DATE_TRUNC('week', c.committed_date)" : "c.committed_date::date";

    const result = await pool.query(
      `SELECT TO_CHAR(${truncExpr}, 'YYYY-MM-DD') as date, COUNT(*)::int as commits
       FROM commits c
       JOIN projects p ON p.id = c.project_id
       ${where}
       GROUP BY ${truncExpr}
       ORDER BY date`,
      params
    );

    return result.rows.map((r) => ({
      date: r.date,
      commits: r.commits,
      merge_requests: 0,
      pipelines: 0,
    }));
  }

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.project_ids && filters.project_ids.length > 0) {
    conditions.push(`pa.project_id = ANY($${idx++})`);
    params.push(filters.project_ids);
  }
  if (filters.tag && filters.tag.length > 0) {
    conditions.push(`p.tags &&($${idx++})`);
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

  if (filters.group_by === "week") {
    const result = await pool.query(
      `SELECT TO_CHAR(DATE_TRUNC('week', pa.date), 'YYYY-MM-DD') as date,
              SUM(pa.commits) as commits,
              SUM(pa.merge_requests) as merge_requests,
              SUM(pa.pipelines) as pipelines
       FROM project_activity pa
       JOIN projects p ON p.id = pa.project_id
       ${where}
       GROUP BY DATE_TRUNC('week', pa.date)
       ORDER BY date`,
      params
    );
    return result.rows.map((r) => ({
      date: r.date,
      commits: Number(r.commits),
      merge_requests: Number(r.merge_requests),
      pipelines: Number(r.pipelines),
    }));
  }

  const result = await pool.query(
    `SELECT pa.date::text,
            SUM(pa.commits) as commits,
            SUM(pa.merge_requests) as merge_requests,
            SUM(pa.pipelines) as pipelines
     FROM project_activity pa
     JOIN projects p ON p.id = pa.project_id
     ${where}
     GROUP BY pa.date
     ORDER BY pa.date`,
    params
  );

  return result.rows.map((r) => ({
    date: r.date,
    commits: Number(r.commits),
    merge_requests: Number(r.merge_requests),
    pipelines: Number(r.pipelines),
  }));
}
