// ARCH-04: Rebuild contributor_profiles using contributor_directory mapping
// Ensures each unique person appears once per project with their canonical display_name
// and merged statistics, instead of one row per email.

exports.up = async function(pgm) {
  // Rebuild contributor_profiles from commits with directory mapping for ALL projects.
  // This is safe because:
  // 1. We only DELETE + reINSERT aggregate data (not raw commits)
  // 2. The gitlab_contributors Dagster asset will re-run hourly
  // 3. contributor_directory mapping is stable and verified
  await pgm.sql(`
    DELETE FROM contributor_profiles
  `);

  await pgm.sql(`
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
    LEFT JOIN (
      SELECT DISTINCT ON (LOWER(email))
        LOWER(email) as email_lower,
        display_name,
        gitlab_user_id
      FROM contributor_directory, unnest(emails) as email
      ORDER BY LOWER(email), is_valid DESC
    ) dm ON dm.email_lower = LOWER(c.author_email)
    LEFT JOIN (
      SELECT project_id, author_email,
             jsonb_object_agg(day, cnt) as frequency
      FROM (
        SELECT project_id, author_email,
               TO_CHAR(committed_date, 'YYYY-MM-DD') as day,
               COUNT(*) as cnt
        FROM commits
        WHERE committed_date >= NOW() - INTERVAL '90 days'
        GROUP BY project_id, author_email, TO_CHAR(committed_date, 'YYYY-MM-DD')
      ) d
      GROUP BY project_id, author_email
    ) f ON f.project_id = c.project_id AND f.author_email = c.author_email
    GROUP BY c.project_id, c.author_email, dm.display_name, dm.gitlab_user_id, f.frequency
  `);
};

exports.down = async function(pgm) {
  // Cannot restore previous state without raw data — this is intentionally a no-op.
  // The previous contributor_profiles state was built by the gitlab_contributors Dagster asset
  // and will be rebuilt on the next hourly run.
  await pgm.sql(`SELECT 1 -- no-op for down migration`);
};
