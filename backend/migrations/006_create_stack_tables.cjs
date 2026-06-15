exports.up = (pgm) => {
  pgm.createTable("project_languages", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true, references: "projects(id)", onDelete: "CASCADE" },
    language: { type: "text", notNull: true },
    bytes: { type: "integer", notNull: true, default: 0 },
    percentage: { type: "numeric(5,2)", notNull: true, default: 0 },
    collected_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("project_languages", "project_id");
  pgm.createIndex("project_languages", ["project_id", "language"], { unique: true });

  pgm.createTable("project_packages", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true, references: "projects(id)", onDelete: "CASCADE" },
    name: { type: "text", notNull: true },
    version: { type: "text", notNull: true, default: "" },
    source: { type: "text", notNull: true, default: "" },
    collected_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("project_packages", "project_id");
  pgm.createIndex("project_packages", ["project_id", "name"]);
};

exports.down = (pgm) => {
  pgm.dropTable("project_packages");
  pgm.dropTable("project_languages");
};
