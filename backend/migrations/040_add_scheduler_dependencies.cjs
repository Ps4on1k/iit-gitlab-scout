exports.up = async function(pgm) {
  await pgm.sql(`
    INSERT INTO scheduler_settings (task_name, enabled, interval_minutes)
    VALUES ('collect_dependencies', false, 1440)
    ON CONFLICT DO NOTHING
  `);
};

exports.down = async function(pgm) {
  await pgm.sql("DELETE FROM scheduler_settings WHERE task_name = 'collect_dependencies'");
};
