exports.up = (pgm) => {
  pgm.createTable("project_pipelines", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true, references: "projects(id)", onDelete: "CASCADE" },
    gitlab_id: { type: "integer", notNull: true },
    status: { type: "text", notNull: true },
    ref: { type: "text", default: "''" },
    source: { type: "text", default: "''" },
    duration: { type: "integer" },
    created_at: { type: "timestamptz" },
    updated_at: { type: "timestamptz" },
    finished_at: { type: "timestamptz" },
    user_name: { type: "text", default: "''" },
  });

  pgm.createIndex("project_pipelines", "project_id");
  pgm.createIndex("project_pipelines", ["project_id", "gitlab_id"], { unique: true });
  pgm.createIndex("project_pipelines", ["project_id", "status"]);
};

exports.down = (pgm) => {
  pgm.dropTable("project_pipelines");
};
