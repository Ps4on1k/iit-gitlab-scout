// ARCH-01: Backend scheduler becomes manual-only. Dagster is single source of truth for scheduled collection.
// All tasks default to disabled; admin can enable only for manual triggers & debugging.
exports.up = (pgm) => {
  // Set all existing tasks to disabled on migration — they now serve as manual triggers only
  pgm.sql(`
    UPDATE scheduler_settings SET enabled = false, updated_at = now()
    WHERE task_name IN (
      'collect_stack', 'collect_activity', 'collect_contributors',
      'collect_branches', 'collect_merge_requests', 'collect_pipelines',
      'collect_dependencies'
    )
  `);

  // New defaults for future installs: Dagster is the orchestrator, so backend starts disabled.
  pgm.sql(`
    INSERT INTO scheduler_settings (task_name, enabled, interval_minutes, last_run_at)
    VALUES
      ('collect_stack', false, 1440, NULL),
      ('collect_activity', false, 1440, NULL),
      ('collect_contributors', false, 1440, NULL),
      ('collect_branches', false, 1440, NULL),
      ('collect_merge_requests', false, 1440, NULL),
      ('collect_pipelines', false, 1440, NULL),
      ('collect_dependencies', false, 10080, NULL)
    ON CONFLICT (task_name) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE scheduler_settings SET enabled = true, updated_at = now()
    WHERE task_name IN (
      'collect_stack', 'collect_activity', 'collect_contributors',
      'collect_branches', 'collect_merge_requests', 'collect_pipelines',
      'collect_dependencies'
    )
  `);
};
