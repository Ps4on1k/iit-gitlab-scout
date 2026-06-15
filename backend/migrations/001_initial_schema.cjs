exports.up = (pgm) => {
  pgm.createTable("analysis_runs", {
    id: { type: "serial", primaryKey: true },
    analyzed_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    projects_count: { type: "integer", notNull: true },
  });

  pgm.createTable("project_results", {
    id: { type: "serial", primaryKey: true },
    run_id: {
      type: "integer",
      notNull: true,
      references: "analysis_runs(id)",
      onDelete: "CASCADE",
    },
    project_path: { type: "text", notNull: true },
    label: { type: "text", notNull: true },
    language: { type: "text" },
    total_dependencies: { type: "integer", notNull: true, default: 0 },
    contributors_count: { type: "integer", notNull: true, default: 0 },
    error: { type: "text" },
    raw_json: { type: "jsonb", notNull: true },
  });

  pgm.createIndex("project_results", "run_id");
  pgm.createIndex("project_results", "project_path");

  pgm.createTable("contributors", {
    id: { type: "serial", primaryKey: true },
    result_id: {
      type: "integer",
      notNull: true,
      references: "project_results(id)",
      onDelete: "CASCADE",
    },
    author_name: { type: "text", notNull: true },
    author_email: { type: "text", notNull: true },
    total_commits: { type: "integer", notNull: true },
    first_commit_date: { type: "timestamptz", notNull: true },
    last_commit_date: { type: "timestamptz", notNull: true },
    frequency: { type: "jsonb", notNull: true, default: "{}" },
  });

  pgm.createIndex("contributors", "result_id");

  pgm.createTable("dependency_files", {
    id: { type: "serial", primaryKey: true },
    result_id: {
      type: "integer",
      notNull: true,
      references: "project_results(id)",
      onDelete: "CASCADE",
    },
    file_path: { type: "text", notNull: true },
    file_type: { type: "text", notNull: true },
    dependencies: { type: "jsonb", notNull: true, default: "[]" },
  });

  pgm.createIndex("dependency_files", "result_id");
};

exports.down = (pgm) => {
  pgm.dropTable("dependency_files");
  pgm.dropTable("contributors");
  pgm.dropTable("project_results");
  pgm.dropTable("analysis_runs");
};
