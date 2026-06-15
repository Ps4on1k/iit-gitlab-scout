import { getPool } from "./pool.js";

export interface DbCommit {
  id: number;
  project_id: number;
  commit_sha: string;
  author_name: string;
  author_email: string;
  committed_date: string;
  additions: number;
  deletions: number;
  total_changes: number;
  branch: string;
  raw_json: any;
}

export interface DbContributor {
  id: number;
  project_id: number;
  author_email: string;
  author_name: string;
  total_commits: number;
  total_additions: number;
  total_deletions: number;
  total_changes: number;
  first_commit_date: string;
  last_commit_date: string;
  frequency: Record<string, number>;
  updated_at: string;
}

export interface ContributorFilters {
  project_id?: number;
  project_ids?: number[];
  author_email?: string;
  date_from?: string;
  date_to?: string;
}

export async function upsertCommit(commit: Omit<DbCommit, "id">): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO commits (project_id, commit_sha, author_name, author_email, committed_date, additions, deletions, total_changes, branch, raw_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (project_id, commit_sha) DO NOTHING`,
    [
      commit.project_id, commit.commit_sha, commit.author_name, commit.author_email,
      commit.committed_date, commit.additions, commit.deletions, commit.total_changes,
      commit.branch, JSON.stringify(commit.raw_json),
    ]
  );
}

export async function getExistingSha(projectId: number, shas: string[]): Promise<Set<string>> {
  if (shas.length === 0) return new Set();
  const pool = getPool();
  const result = await pool.query(
    "SELECT commit_sha FROM commits WHERE project_id = $1 AND commit_sha = ANY($2)",
    [projectId, shas]
  );
  return new Set(result.rows.map((r) => r.commit_sha));
}

export async function refreshContributors(projectId: number): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM contributor_profiles WHERE project_id = $1`, [projectId]);
  await pool.query(
    `INSERT INTO contributor_profiles (project_id, author_email, author_name, total_commits, total_additions, total_deletions, total_changes, first_commit_date, last_commit_date, frequency)
     SELECT
       project_id,
       author_email,
       MAX(author_name) as author_name,
       SUM(cnt) as total_commits,
       SUM(additions) as total_additions,
       SUM(deletions) as total_deletions,
       SUM(total_changes) as total_changes,
       MIN(committed_date) as first_commit_date,
       MAX(committed_date) as last_commit_date,
       COALESCE(
         jsonb_object_agg(date_str, cnt),
         '{}'::jsonb
       ) as frequency
     FROM (
       SELECT project_id, author_email, author_name, additions, deletions, total_changes, committed_date,
              TO_CHAR(committed_date, 'YYYY-MM-DD') as date_str,
              COUNT(*) as cnt
       FROM commits
       WHERE project_id = $1
       GROUP BY project_id, author_email, author_name, additions, deletions, total_changes, committed_date
     ) sub
     GROUP BY project_id, author_email`,
    [projectId]
  );
}

export async function getContributors(filters: ContributorFilters): Promise<DbContributor[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.project_ids && filters.project_ids.length > 0) {
    conditions.push(`project_id = ANY($${idx++})`);
    params.push(filters.project_ids);
  } else if (filters.project_id) {
    conditions.push(`project_id = $${idx++}`);
    params.push(filters.project_id);
  }
  if (filters.author_email) {
    conditions.push(`author_email = $${idx++}`);
    params.push(filters.author_email);
  }
  if (filters.date_from) {
    conditions.push(`last_commit_date >= $${idx++}`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`first_commit_date <= $${idx++}`);
    params.push(filters.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT
       author_email,
       MAX(author_name) as author_name,
       SUM(total_commits)::int as total_commits,
       SUM(total_additions)::int as total_additions,
       SUM(total_deletions)::int as total_deletions,
       SUM(total_changes)::int as total_changes,
       MIN(first_commit_date) as first_commit_date,
       MAX(last_commit_date) as last_commit_date
     FROM contributor_profiles
     ${where}
     GROUP BY author_email
     ORDER BY total_changes DESC`,
    params
  );

  // Merge frequency from all project rows per email
  const rows = result.rows;
  for (const row of rows) {
    const freqResult = await pool.query(
      `SELECT frequency FROM contributor_profiles WHERE author_email = $1 ${filters.project_id ? "AND project_id = " + filters.project_id : ""}`,
      [row.author_email]
    );
    const merged: Record<string, number> = {};
    for (const fr of freqResult.rows) {
      for (const [k, v] of Object.entries(fr.frequency || {})) {
        merged[k] = (merged[k] || 0) + Number(v);
      }
    }
    row.frequency = merged;
  }

  return rows;
}

export async function getCommitsForProject(
  projectId: number,
  dateFrom?: string,
  dateTo?: string
): Promise<DbCommit[]> {
  const pool = getPool();
  const conditions = ["project_id = $1"];
  const params: any[] = [projectId];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`committed_date >= $${idx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`committed_date <= $${idx++}`);
    params.push(dateTo);
  }

  const result = await pool.query(
    `SELECT * FROM commits WHERE ${conditions.join(" AND ")} ORDER BY committed_date`,
    params
  );
  return result.rows;
}

export async function getHeatmapData(projectIds?: number[], dateFrom?: string, dateTo?: string): Promise<{
  by_project: Record<string, Record<string, number>>;
  by_contributor: Record<string, Record<string, number>>;
  project_contributors: Record<string, string[]>;
  by_project_contributor: Record<string, Record<string, Record<string, number>>>;
}> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (projectIds && projectIds.length > 0) {
    conditions.push(`c.project_id = ANY($${idx++})`);
    params.push(projectIds);
  }
  if (dateFrom) {
    conditions.push(`c.committed_date >= $${idx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`c.committed_date <= $${idx++}`);
    params.push(dateTo);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `WITH canonical_names AS (
       SELECT author_email, MAX(author_name) as author_name
       FROM commits
       GROUP BY author_email
     )
     SELECT p.path as project_path, c.author_email, cn.author_name, TO_CHAR(c.committed_date, 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
     FROM commits c
     JOIN projects p ON p.id = c.project_id
     JOIN canonical_names cn ON cn.author_email = c.author_email
     ${where}
     GROUP BY p.path, c.author_email, cn.author_name, day
     ORDER BY day`,
    params
  );

  const byProject: Record<string, Record<string, number>> = {};
  const byContributor: Record<string, Record<string, number>> = {};
  const projectContributors: Record<string, Set<string>> = {};
  const byProjectContributor: Record<string, Record<string, Record<string, number>>> = {};

  for (const row of result.rows) {
    if (!byProject[row.project_path]) byProject[row.project_path] = {};
    byProject[row.project_path][row.day] = (byProject[row.project_path][row.day] || 0) + row.cnt;

    if (!projectContributors[row.project_path]) projectContributors[row.project_path] = new Set();
    projectContributors[row.project_path].add(row.author_email);

    const contributorLabel = row.author_name
      ? `${row.author_email} (${row.author_name})`
      : row.author_email;

    if (!byProjectContributor[row.project_path]) byProjectContributor[row.project_path] = {};
    if (!byProjectContributor[row.project_path][contributorLabel]) byProjectContributor[row.project_path][contributorLabel] = {};
    byProjectContributor[row.project_path][contributorLabel][row.day] =
      (byProjectContributor[row.project_path][contributorLabel][row.day] || 0) + row.cnt;

    if (!byContributor[contributorLabel]) byContributor[contributorLabel] = {};
    byContributor[contributorLabel][row.day] = (byContributor[contributorLabel][row.day] || 0) + row.cnt;
  }

  const projectContributorsArr: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(projectContributors)) {
    projectContributorsArr[k] = Array.from(v);
  }

  return { by_project: byProject, by_contributor: byContributor, project_contributors: projectContributorsArr, by_project_contributor: byProjectContributor };
}

export async function getMetrics(filters: ContributorFilters): Promise<any> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.project_ids && filters.project_ids.length > 0) {
    conditions.push(`c.project_id = ANY($${idx++})`);
    params.push(filters.project_ids);
  } else if (filters.project_id) {
    conditions.push(`c.project_id = $${idx++}`);
    params.push(filters.project_id);
  }
  if (filters.date_from) {
    conditions.push(`c.committed_date >= $${idx++}`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`c.committed_date <= $${idx++}`);
    params.push(filters.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT c.author_email) as unique_contributors,
       COUNT(*) as total_commits,
       SUM(c.additions) as total_additions,
       SUM(c.deletions) as total_deletions,
       SUM(c.total_changes) as total_changes,
       MIN(c.committed_date) as period_start,
       MAX(c.committed_date) as period_end
     FROM commits c
     ${where}`,
    params
  );

  const row = result.rows[0];
  const calendarDays = Math.max(1, Math.ceil(
    (new Date(row.period_end).getTime() - new Date(row.period_start).getTime()) / 86400000
  ) + 1);

  return {
    unique_contributors: Number(row.unique_contributors),
    total_commits: Number(row.total_commits),
    total_additions: Number(row.total_additions),
    total_deletions: Number(row.total_deletions),
    total_changes: Number(row.total_changes),
    period_start: row.period_start,
    period_end: row.period_end,
    calendar_days: calendarDays,
    avg_commits_per_day: Number(row.total_commits) / calendarDays,
    avg_changes_per_day: Number(row.total_changes) / calendarDays,
    avg_changes_per_commit: Number(row.total_changes) / Math.max(1, Number(row.total_commits)),
  };
}
