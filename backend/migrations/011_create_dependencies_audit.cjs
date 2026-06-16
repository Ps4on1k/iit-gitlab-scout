exports.up = (pgm) => {
  pgm.createTable("project_dependencies_audit", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true, references: "projects(id)", onDelete: "CASCADE" },
    name: { type: "text", notNull: true },
    current_version: { type: "text", notNull: true, default: "''" },
    latest_version: { type: "text", default: "''" },
    is_outdated: { type: "boolean", notNull: true, default: false },
    license: { type: "text", default: "''" },
    source: { type: "text", notNull: true, default: "''" },
    collected_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("project_dependencies_audit", "project_id");
  pgm.createIndex("project_dependencies_audit", ["project_id", "name"]);
};

exports.down = (pgm) => {
  pgm.dropTable("project_dependencies_audit");
};
