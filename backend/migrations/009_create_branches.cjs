exports.up = (pgm) => {
  pgm.createTable("project_branches", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true, references: "projects(id)", onDelete: "CASCADE" },
    name: { type: "text", notNull: true },
    default: { type: "boolean", notNull: true, default: false },
    merged: { type: "boolean", notNull: true, default: false },
    protected: { type: "boolean", notNull: true, default: false },
    last_commit_date: { type: "timestamptz" },
    last_commit_author: { type: "text", default: "''" },
    created_at_collected: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("project_branches", "project_id");
  pgm.createIndex("project_branches", ["project_id", "name"]);
};

exports.down = (pgm) => {
  pgm.dropTable("project_branches");
};
