exports.up = (pgm) => {
  pgm.sql(`INSERT INTO scheduler_settings (task_name, enabled, interval_minutes) VALUES ('collect_pipelines', true, 1440) ON CONFLICT (task_name) DO NOTHING`);
};

exports.down = (pgm) => {
  pgm.sql(`DELETE FROM scheduler_settings WHERE task_name = 'collect_pipelines'`);
};
