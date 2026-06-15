exports.up = (pgm) => {
  pgm.createTable("scheduler_settings", {
    id: { type: "serial", primaryKey: true },
    task_name: { type: "text", notNull: true, unique: true },
    enabled: { type: "boolean", notNull: true, default: true },
    interval_minutes: { type: "integer", notNull: true, default: 60 },
    last_run_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.sql(`INSERT INTO scheduler_settings (task_name, enabled, interval_minutes) VALUES
    ('collect_stack', true, 1440),
    ('collect_activity', true, 1440),
    ('collect_contributors', true, 1440)
    ON CONFLICT (task_name) DO NOTHING`);
};

exports.down = (pgm) => {
  pgm.dropTable("scheduler_settings");
};
