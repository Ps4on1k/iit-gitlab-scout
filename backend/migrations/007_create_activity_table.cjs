exports.up = (pgm) => {
  pgm.createTable("project_activity", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true, references: "projects(id)", onDelete: "CASCADE" },
    date: { type: "date", notNull: true },
    commits: { type: "integer", notNull: true, default: 0 },
    merge_requests: { type: "integer", notNull: true, default: 0 },
    pipelines: { type: "integer", notNull: true, default: 0 },
    collected_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("project_activity", ["project_id", "date"], { unique: true });
};

exports.down = (pgm) => {
  pgm.dropTable("project_activity");
};
