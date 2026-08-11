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
  gitlab_user_id?: number | null;
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
    `INSERT INTO commits (project_id, commit_sha, author_name, author_email, committed_date, additions, deletions, total_changes, branch, raw_json, gitlab_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (project_id, commit_sha) DO UPDATE SET
       gitlab_user_id = COALESCE(commits.gitlab_user_id, EXCLUDED.gitlab_user_id)`,
    [
      commit.project_id, commit.commit_sha, commit.author_name, commit.author_email,
      commit.committed_date, commit.additions, commit.deletions, commit.total_changes,
      commit.branch, JSON.stringify(commit.raw_json), commit.gitlab_user_id ?? null,
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

  // ARCH-04: Rebuild contributor_profiles from commits, resolving each email
  // through contributor_directory to get canonical display_name + gitlab_user_id.
  // Groups by gitlab_user_id when available → one row per person regardless of email count.

  await pool.query(`DELETE FROM contributor_profiles WHERE project_id = $1`, [projectId]);

  // Single atomic query: CTE builds the email→directory map (no TEMP TABLE — pool may switch connections)
  // Note: contributor_profiles PK is (project_id, author_email) — we keep that, but set
  // display_name from directory so all emails of one person show the same name.
  // True grouping by person happens in getContributors() via display_name.
  await pool.query(
    `WITH dir_map AS (
       SELECT DISTINCT ON (LOWER(email))
         LOWER(email) as email_lower,
         display_name,
         gitlab_user_id
       FROM contributor_directory, unnest(emails) as email
       ORDER BY LOWER(email), is_valid DESC
     ),
     daily_freq AS (
       SELECT author_email,
              jsonb_object_agg(day, cnt) as frequency
       FROM (
         SELECT author_email,
                TO_CHAR(committed_date, 'YYYY-MM-DD') as day,
                COUNT(*) as cnt
         FROM commits
         WHERE project_id = $1
         GROUP BY author_email, TO_CHAR(committed_date, 'YYYY-MM-DD')
       ) d
       GROUP BY author_email
     )
     INSERT INTO contributor_profiles (project_id, author_email, author_name, total_commits,
                                        total_additions, total_deletions, total_changes,
                                        first_commit_date, last_commit_date, frequency, gitlab_user_id)
     SELECT
       c.project_id,
       c.author_email,
       COALESCE(dm.display_name,
                MAX(c.author_name) FILTER (WHERE c.author_name NOT LIKE '%@%'),
                MAX(c.author_name)) as author_name,
       COUNT(*)::int as total_commits,
       SUM(c.additions)::int as total_additions,
       SUM(c.deletions)::int as total_deletions,
       SUM(c.additions + c.deletions)::int as total_changes,
       MIN(c.committed_date) as first_commit_date,
       MAX(c.committed_date) as last_commit_date,
       COALESCE(f.frequency, '{}'::jsonb) as frequency,
       dm.gitlab_user_id
     FROM commits c
     LEFT JOIN dir_map dm ON dm.email_lower = LOWER(c.author_email)
     LEFT JOIN daily_freq f ON f.author_email = c.author_email
     WHERE c.project_id = $1
     GROUP BY c.project_id, c.author_email, dm.display_name, dm.gitlab_user_id, f.frequency
     ON CONFLICT (project_id, author_email) DO UPDATE SET
       author_name = EXCLUDED.author_name,
       total_commits = EXCLUDED.total_commits,
       total_additions = EXCLUDED.total_additions,
       total_deletions = EXCLUDED.total_deletions,
       total_changes = EXCLUDED.total_changes,
       first_commit_date = EXCLUDED.first_commit_date,
       last_commit_date = EXCLUDED.last_commit_date,
       frequency = EXCLUDED.frequency,
       gitlab_user_id = EXCLUDED.gitlab_user_id`,
    [projectId]
  );

  // Invalidate resolver cache to pick up new user mappings
  // NOTE: resolved via services/contributor-resolver.ts — imported dynamically to avoid circular dep
  const { invalidateContributorCache } = await import("../services/contributor-resolver.js");
  invalidateContributorCache();
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

  // When date filters are active, compute stats from commits table for accuracy
  const hasDateFilter = filters.date_from || filters.date_to;
  let result;

  if (hasDateFilter) {
    const commitConditions: string[] = [];
    const commitParams: any[] = [];
    let cIdx = 1;
    if (filters.project_ids && filters.project_ids.length > 0) {
      commitConditions.push(`c.project_id = ANY($${cIdx++})`);
      commitParams.push(filters.project_ids);
    } else if (filters.project_id) {
      commitConditions.push(`c.project_id = $${cIdx++}`);
      commitParams.push(filters.project_id);
    }
    if (filters.date_from) {
      commitConditions.push(`c.committed_date >= $${cIdx++}`);
      commitParams.push(filters.date_from);
    }
    if (filters.date_to) {
      commitConditions.push(`c.committed_date <= $${cIdx++}`);
      commitParams.push(filters.date_to + "T23:59:59Z");
    }
    const commitWhere = commitConditions.length > 0 ? `WHERE ${commitConditions.join(" AND ")}` : "";

    // ARCH-04: Resolve emails through contributor_directory and include frequency data
    result = await pool.query(
      `WITH dir_map AS (
         SELECT DISTINCT ON (LOWER(email))
           LOWER(email) as email_lower,
           display_name,
           (emails[1]) as primary_email
         FROM contributor_directory,
              unnest(emails) as email
         ORDER BY LOWER(email), is_valid DESC
       ),
       resolved AS (
         SELECT
           COALESCE(dm.display_name, c.author_email) as display_name,
           COALESCE(dm.primary_email, c.author_email) as primary_email,
           c.author_email,
           c.committed_date,
           c.additions,
           c.deletions
         FROM commits c
         LEFT JOIN dir_map dm ON dm.email_lower = LOWER(c.author_email)
         ${commitWhere}
       ),
       daily_freq AS (
         SELECT display_name, primary_email,
                jsonb_object_agg(day, cnt) as frequency
         FROM (
           SELECT display_name, primary_email,
                  TO_CHAR(committed_date, 'YYYY-MM-DD') as day,
                  COUNT(*) as cnt
           FROM resolved
           GROUP BY display_name, primary_email, TO_CHAR(committed_date, 'YYYY-MM-DD')
         ) d
         GROUP BY display_name, primary_email
       )
       SELECT
         r.primary_email as author_email,
         r.display_name as author_name,
         COUNT(*)::int as total_commits,
         COALESCE(SUM(r.additions), 0)::int as total_additions,
         COALESCE(SUM(r.deletions), 0)::int as total_deletions,
         COALESCE(SUM(r.additions + r.deletions), 0)::int as total_changes,
         MIN(r.committed_date) as first_commit_date,
         MAX(r.committed_date) as last_commit_date,
         COALESCE(df.frequency, '{}'::jsonb) as frequency
       FROM resolved r
       LEFT JOIN daily_freq df ON df.display_name = r.display_name AND df.primary_email = r.primary_email
       GROUP BY r.display_name, r.primary_email, df.frequency
       ORDER BY total_commits DESC`,
      commitParams
    );
  } else {
    // ARCH-04: GROUP BY display_name from contributor_directory (not just author_email).
    // This merges commits from different emails of the same person.
    result = await pool.query(
      `WITH resolved AS (
         SELECT
           cp.project_id,
           cp.author_email,
           cp.author_name,
           cp.total_commits,
           cp.total_additions,
           cp.total_deletions,
           cp.total_changes,
           cp.first_commit_date,
           cp.last_commit_date,
           cp.frequency,
           cp.gitlab_user_id,
           COALESCE(dm.display_name, cp.author_email) as display_name,
           COALESCE(dm.primary_email, cp.author_email) as primary_email
         FROM contributor_profiles cp
         LEFT JOIN (
           SELECT DISTINCT ON (lower(email))
             lower(email) as email_lower,
             display_name,
             (emails[1]) as primary_email,
             gitlab_user_id
           FROM contributor_directory,
                unnest(emails) as email
           ORDER BY lower(email), is_valid DESC
         ) dm ON dm.email_lower = lower(cp.author_email)
         ${where.replace(/author_email/g, 'cp.author_email')}
       )
       SELECT
         primary_email as author_email,
         display_name as author_name,
         SUM(total_commits)::int as total_commits,
         SUM(total_additions)::int as total_additions,
         SUM(total_deletions)::int as total_deletions,
         SUM(total_changes)::int as total_changes,
         MIN(first_commit_date) as first_commit_date,
         MAX(last_commit_date) as last_commit_date
       FROM resolved
       GROUP BY display_name, primary_email
       ORDER BY total_changes DESC`,
      params
    );
  }

  // Load contributor directory for grouping
  const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
  const emailToName: Record<string, string> = {};
  const nameToFirstEmail: Record<string, string> = {};
  for (const row of dirResult.rows) {
    for (const email of row.emails) {
      emailToName[email] = row.display_name;
      emailToName[email.toLowerCase()] = row.display_name;
      const localPart = email.split("@")[0];
      if (localPart && localPart !== email) {
        emailToName[localPart] = row.display_name;
      }
      if (!nameToFirstEmail[row.display_name]) {
        nameToFirstEmail[row.display_name] = email;
      }
    }
  }

  // Frequency: merge by original email from commits (not grouped by directory yet)
  // For date-filtered queries, frequency is already included in the SQL result
  const emailFrequencies = new Map<string, Record<string, number>>();
  if (!hasDateFilter) {
    let freqQuery = "";
    let freqParams: any[] = [];
    if (filters.project_ids && filters.project_ids.length > 0) {
      freqQuery = `SELECT author_email, frequency FROM contributor_profiles WHERE project_id = ANY($1)`;
      freqParams = [filters.project_ids];
    } else if (filters.project_id) {
      freqQuery = `SELECT author_email, frequency FROM contributor_profiles WHERE project_id = $1`;
      freqParams = [filters.project_id];
    } else {
      // No project filter — load all profiles
      freqQuery = `SELECT author_email, frequency FROM contributor_profiles`;
      freqParams = [];
    }
    if (freqQuery) {
      const freqResult = await pool.query(freqQuery, freqParams);
      for (const fr of freqResult.rows) {
        const existing = emailFrequencies.get(fr.author_email) || {};
        const freq = fr.frequency as Record<string, number>;
        for (const [day, cnt] of Object.entries(freq)) {
          existing[day] = (existing[day] || 0) + Number(cnt);
        }
        emailFrequencies.set(fr.author_email, existing);
      }
    }
  }

  // Group by display_name from query result (already resolved)
  const grouped = new Map<string, {
    author_email: string; author_name: string;
    total_commits: number; total_additions: number; total_deletions: number; total_changes: number;
    first_commit_date: string; last_commit_date: string;
    frequency: Record<string, number>;
    emails: string[];
  }>();

  for (const row of result.rows) {
    // After our new SQL query, each row is already grouped by display_name
    const displayName = row.author_name; // This is display_name from the resolved CTE
    const primaryEmail = row.author_email; // This is primary_email from the resolved CTE

    // Collect all emails for this person
    const allEmails = new Set<string>([primaryEmail]);

    // For date-filtered queries, frequency comes from SQL result directly
    // For non-date queries, merge from emailFrequencies (contributor_profiles)
    const mergedFreq: Record<string, number> = {};
    if (hasDateFilter && row.frequency) {
      // Frequency is already in the SQL result (jsonb from daily_freq CTE)
      const freq = typeof row.frequency === 'string' ? JSON.parse(row.frequency) : row.frequency;
      for (const [day, cnt] of Object.entries(freq)) {
        mergedFreq[day] = Number(cnt);
      }
    } else {
      // Merge frequency data from contributor_profiles
      for (const [email, freq] of emailFrequencies) {
        const mappedName = emailToName[email] || emailToName[email.toLowerCase()];
        if (mappedName === displayName || email === primaryEmail) {
          allEmails.add(email);
          for (const [day, cnt] of Object.entries(freq)) {
            mergedFreq[day] = (mergedFreq[day] || 0) + Number(cnt);
          }
        }
      }
    }

    const existing = grouped.get(displayName);
    if (existing) {
      existing.total_commits += Number(row.total_commits);
      existing.total_additions += Number(row.total_additions);
      existing.total_deletions += Number(row.total_deletions);
      existing.total_changes += Number(row.total_changes);
      for (const e of allEmails) {
        if (!existing.emails.includes(e)) existing.emails.push(e);
      }
      for (const [k, v] of Object.entries(mergedFreq)) {
        existing.frequency[k] = (existing.frequency[k] || 0) + Number(v);
      }
    } else {
      grouped.set(displayName, {
        author_email: primaryEmail,
        author_name: displayName,
        total_commits: Number(row.total_commits),
        total_additions: Number(row.total_additions),
        total_deletions: Number(row.total_deletions),
        total_changes: Number(row.total_changes),
        first_commit_date: row.first_commit_date,
        last_commit_date: row.last_commit_date,
        frequency: mergedFreq,
        emails: Array.from(allEmails),
      });
    }
  }

  // Also include authors from project_branches who are NOT in contributor_profiles
  const existingEmails = new Set<string>();
  for (const g of grouped.values()) {
    for (const e of g.emails) existingEmails.add(e);
  }

  const branchWhere: string[] = [];
  const branchParams: any[] = [];
  let bIdx = 1;
  if (filters.project_ids && filters.project_ids.length > 0) {
    branchWhere.push(`pb.project_id = ANY($${bIdx++})`);
    branchParams.push(filters.project_ids);
  } else if (filters.project_id) {
    branchWhere.push(`pb.project_id = $${bIdx++}`);
    branchParams.push(filters.project_id);
  }

  const branchResult = await pool.query(
    `SELECT DISTINCT pb.last_commit_author_email, pb.last_commit_author
     FROM project_branches pb
     ${branchWhere.length > 0 ? "WHERE " + branchWhere.join(" AND ") : ""}
     ${branchWhere.length > 0 ? "AND" : "WHERE"} pb.last_commit_author_email IS NOT NULL AND pb.last_commit_author_email != ''`,
    branchParams
  );

  for (const brow of branchResult.rows) {
    if (existingEmails.has(brow.last_commit_author_email)) continue;

    const email = brow.last_commit_author_email;
    const name = brow.last_commit_author || email;
    const displayName = emailToName[email] || name;
    const primaryEmail = nameToFirstEmail[displayName] || email;

    if (grouped.has(displayName)) {
      const existing = grouped.get(displayName)!;
      if (!existing.emails.includes(email)) existing.emails.push(email);
    } else {
      grouped.set(displayName, {
        author_email: primaryEmail,
        author_name: displayName,
        total_commits: 0,
        total_additions: 0,
        total_deletions: 0,
        total_changes: 0,
        first_commit_date: "",
        last_commit_date: "",
        frequency: {},
        emails: [email],
      });
    }
  }

  return Array.from(grouped.values()).map((g, i) => ({
    id: i,
    project_id: 0,
    ...g,
    updated_at: new Date().toISOString(),
  })).sort((a, b) => b.total_changes - a.total_changes);
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
  project_labels: Record<string, string>;
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

  // ARCH-04: Resolve emails via contributor_directory CTE in SQL for grouping
  const result = await pool.query(
    `WITH dir_emails AS (
       SELECT DISTINCT ON (LOWER(email))
         LOWER(email) as email_lower,
         display_name,
         (emails[1]) as primary_email
       FROM contributor_directory,
            unnest(emails) as email
       ORDER BY LOWER(email), is_valid DESC
     ),
     canonical_names AS (
       SELECT c.author_email,
              COALESCE(dm.display_name, MAX(c.author_name) FILTER (WHERE c.author_name NOT LIKE '%@%'), MAX(c.author_name)) as author_name
       FROM commits c
       LEFT JOIN dir_emails dm ON dm.email_lower = LOWER(c.author_email)
       GROUP BY c.author_email, dm.display_name
     )
     SELECT CONCAT(p.path, ' || ', p.base_url) as project_key,
            p.path as project_path, p.label as project_label,
            c.author_email, de.primary_email, cn.author_name as display_name,
            TO_CHAR(c.committed_date, 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
     FROM commits c
     JOIN projects p ON p.id = c.project_id
     JOIN canonical_names cn ON cn.author_email = c.author_email
     LEFT JOIN dir_emails de ON de.email_lower = LOWER(c.author_email)
     ${where}
      GROUP BY p.path, p.base_url, p.label, c.author_email, de.primary_email, cn.author_name, day
     ORDER BY day`,
    params
  );

  // Build maps from the enriched result (already resolved via directory)
  const emailToName: Record<string, string> = {};
  const nameToFirstEmail: Record<string, string> = {};

  for (const row of result.rows) {
    const displayName = row.display_name || row.author_email;
    const primaryEmail = row.primary_email || row.author_email;
    emailToName[row.author_email] = displayName;
    if (!nameToFirstEmail[displayName]) {
      nameToFirstEmail[displayName] = primaryEmail;
    }
  }

  const byProject: Record<string, Record<string, number>> = {};
  const projectLabels: Record<string, string> = {};
  const byContributor: Record<string, Record<string, number>> = {};
  const projectContributors: Record<string, Set<string>> = {};
  const byProjectContributor: Record<string, Record<string, Record<string, number>>> = {};

  for (const row of result.rows) {
    const projKey = row.project_key;
    const projLabel = row.project_label || row.project_path;

    if (!byProject[projKey]) byProject[projKey] = {};
    byProject[projKey][row.day] = (byProject[projKey][row.day] || 0) + row.cnt;

    if (!projectLabels[projKey]) projectLabels[projKey] = projLabel;

    const displayName = emailToName[row.author_email] || row.author_email;
    const primaryEmail = nameToFirstEmail[displayName] || row.author_email;

    if (!projectContributors[projKey]) projectContributors[projKey] = new Set();
    projectContributors[projKey].add(displayName);

    const contributorLabel = `${primaryEmail} (${displayName})`;

    if (!byProjectContributor[projKey]) byProjectContributor[projKey] = {};
    if (!byProjectContributor[projKey][contributorLabel]) byProjectContributor[projKey][contributorLabel] = {};
    byProjectContributor[projKey][contributorLabel][row.day] =
      (byProjectContributor[projKey][contributorLabel][row.day] || 0) + row.cnt;

    if (!byContributor[contributorLabel]) byContributor[contributorLabel] = {};
    byContributor[contributorLabel][row.day] = (byContributor[contributorLabel][row.day] || 0) + row.cnt;
  }

  const projectContributorsArr: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(projectContributors)) {
    projectContributorsArr[k] = Array.from(v);
  }

  return { by_project: byProject, by_contributor: byContributor, project_contributors: projectContributorsArr, by_project_contributor: byProjectContributor, project_labels: projectLabels };
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

  // ARCH-04: Count unique contributors by resolved display_name, not raw author_email
  const result = await pool.query(
    `WITH dir_map AS (
       SELECT DISTINCT ON (LOWER(email))
         LOWER(email) as email_lower,
         display_name
       FROM contributor_directory,
            unnest(emails) as email
       ORDER BY LOWER(email), is_valid DESC
     )
     SELECT
       COUNT(DISTINCT COALESCE(dm.display_name, c.author_email)) as unique_contributors,
       COUNT(*) as total_commits,
       SUM(c.additions) as total_additions,
       SUM(c.deletions) as total_deletions,
       SUM(c.total_changes) as total_changes,
       MIN(c.committed_date) as period_start,
       MAX(c.committed_date) as period_end
     FROM commits c
     LEFT JOIN dir_map dm ON dm.email_lower = LOWER(c.author_email)
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
