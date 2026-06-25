exports.up = async function(pgm) {
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_commits_project_date ON commits (project_id, committed_date)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_commits_project_author ON commits (project_id, author_email)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_branches_project_date ON project_branches (project_id, last_commit_date)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_mr_project_state ON project_merge_requests (project_id, state)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_mr_project_created ON project_merge_requests (project_id, created_at)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pipelines_project_created ON project_pipelines (project_id, created_at)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_issues_project_state ON project_issues (project_id, state)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_languages_language ON project_languages (language)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_scheduler_errors_source ON scheduler_errors (source)`);
};

exports.down = async function(pgm) {
  await pgm.dropIndex("commits", "idx_commits_project_date");
  await pgm.dropIndex("commits", "idx_commits_project_author");
  await pgm.dropIndex("project_branches", "idx_branches_project_date");
  await pgm.dropIndex("project_merge_requests", "idx_mr_project_state");
  await pgm.dropIndex("project_merge_requests", "idx_mr_project_created");
  await pgm.dropIndex("project_pipelines", "idx_pipelines_project_created");
  await pgm.dropIndex("project_issues", "idx_issues_project_state");
  await pgm.dropIndex("project_languages", "idx_languages_language");
  await pgm.dropIndex("scheduler_errors", "idx_scheduler_errors_source");
};
