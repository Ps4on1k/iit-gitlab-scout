// ARCH-04: Use gitlab_user_id as primary identity for contributors
// This separates "VI Мееensed" from "Vladimir" with work email vs personal email
// and properly unifies data across projects
exports.up = async function(pgm) {
  // Add gitlab_user_id (nullable initially) to contributors tables
  await pgm.sql(`
    ALTER TABLE commits
      ADD COLUMN IF NOT EXISTS gitlab_user_id INTEGER
  `);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS commits_user_id_idx ON commits(gitlab_user_id)`);

  await pgm.sql(`
    ALTER TABLE project_branches
      ADD COLUMN IF NOT EXISTS gitlab_user_id INTEGER
  `);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS project_branches_user_id_idx ON project_branches(gitlab_user_id)`);

  await pgm.sql(`
    ALTER TABLE project_merge_requests
      ADD COLUMN IF NOT EXISTS author_gitlab_user_id INTEGER
  `);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS mr_author_user_idx ON project_merge_requests(author_gitlab_user_id)`);

  await pgm.sql(`
    ALTER TABLE project_pipelines
      ADD COLUMN IF NOT EXISTS user_gitlab_user_id INTEGER
  `);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS pipelines_user_idx ON project_pipelines(user_gitlab_user_id)`);

  // contributor_directory: add gitlab_user_id as the canonical identity
  await pgm.sql(`
    ALTER TABLE contributor_directory
      ADD COLUMN IF NOT EXISTS gitlab_user_id INTEGER
  `);
  await pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS contributor_directory_user_id_idx
    ON contributor_directory(gitlab_user_id)
    WHERE gitlab_user_id IS NOT NULL
  `);

  // contributor_profiles: add gitlab_user_id directly
  await pgm.sql(`
    ALTER TABLE contributor_profiles
      ADD COLUMN IF NOT EXISTS gitlab_user_id INTEGER
  `);
  await pgm.sql(`
    CREATE INDEX IF NOT EXISTS contributor_profiles_user_id_idx ON contributor_profiles(gitlab_user_id)
  `);

  // Also allow explicit mapping of a contributor to a directory entry
  await pgm.sql(`
    ALTER TABLE contributor_directory
      ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false
  `);

  // Documentation column: who mapped this user and when
  await pgm.sql(`
    ALTER TABLE contributor_directory
      ADD COLUMN IF NOT EXISTS mapped_by INTEGER,
      ADD COLUMN IF NOT EXISTS mapped_at TIMESTAMPTZ
  `);
};

exports.down = async function(pgm) {
  await pgm.sql(`
    DROP INDEX IF EXISTS contributor_directory_user_id_idx,
    DROP INDEX IF EXISTS commits_user_id_idx,
    DROP INDEX IF EXISTS contributor_profiles_user_id_idx,
    DROP INDEX IF EXISTS project_branches_user_id_idx,
    DROP INDEX IF EXISTS mr_author_user_idx,
    DROP INDEX IF EXISTS pipelines_user_idx
  `);
  await pgm.sql(`
    ALTER TABLE contributor_directory
      DROP COLUMN IF EXISTS gitlab_user_id,
      DROP COLUMN IF EXISTS is_locked,
      DROP COLUMN IF EXISTS mapped_by,
      DROP COLUMN IF EXISTS mapped_at,
    ALTER TABLE commits DROP COLUMN IF EXISTS gitlab_user_id,
    ALTER TABLE contributor_profiles DROP COLUMN IF EXISTS gitlab_user_id,
    ALTER TABLE project_branches DROP COLUMN IF EXISTS gitlab_user_id,
    ALTER TABLE project_merge_requests DROP COLUMN IF EXISTS author_gitlab_user_id,
    ALTER TABLE project_pipelines DROP COLUMN IF EXISTS user_gitlab_user_id
  `);
};
