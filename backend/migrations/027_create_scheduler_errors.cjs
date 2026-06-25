exports.up = (pgm) => {
  pgm.createTable("scheduler_errors", {
    id: { type: "serial", primaryKey: true },
    task_name: { type: "text", notNull: true },
    project_id: { type: "integer" },
    error_code: { type: "text", default: "''" },
    error_message: { type: "text", default: "''" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("scheduler_errors", "task_name");
  pgm.createIndex("scheduler_errors", "created_at");
};

exports.down = (pgm) => {
  pgm.dropTable("scheduler_errors");
};
