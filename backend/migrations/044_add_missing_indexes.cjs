exports.up = async function(pgm) {
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_mr_author ON project_merge_requests (project_id, author_email)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pipelines_ref ON project_pipelines (project_id, ref)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_deployments_project_date ON project_deployments (project_id, created_at)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_contributor_profiles_email ON contributor_profiles (author_email)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_contributor_profiles_project_email ON contributor_profiles (project_id, author_email)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_scheduler_errors_task_date ON scheduler_errors (task_name, created_at)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_deps_audit_project ON project_dependencies_audit (project_id)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_activity_project_date ON project_activity (project_id, date)`);
};

exports.down = async function(pgm) {
  await pgm.dropIndex("project_merge_requests", "idx_mr_author");
  await pgm.dropIndex("project_pipelines", "idx_pipelines_ref");
  await pgm.dropIndex("project_deployments", "idx_deployments_project_date");
  await pgm.dropIndex("contributor_profiles", "idx_contributor_profiles_email");
  await pgm.dropIndex("contributor_profiles", "idx_contributor_profiles_project_email");
  await pgm.dropIndex("scheduler_errors", "idx_scheduler_errors_task_date");
  await pgm.dropIndex("project_dependencies_audit", "idx_deps_audit_project");
  await pgm.dropIndex("project_activity", "idx_activity_project_date");
};
