exports.up = (pgm) => {
  pgm.createTable("project_issues", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true, references: "projects(id)", onDelete: "CASCADE" },
    gitlab_iid: { type: "integer", notNull: true },
    title: { type: "text", notNull: true },
    state: { type: "text", notNull: true, default: "'opened'" },
    author_email: { type: "text", notNull: true, default: "''" },
    assignee_email: { type: "text", default: "''" },
    labels: { type: "text", default: "''" },
    created_at: { type: "timestamptz", notNull: true },
    closed_at: { type: "timestamptz" },
    due_date: { type: "date" },
    weight: { type: "integer" },
    collected_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("project_issues", "project_id");
  pgm.createIndex("project_issues", ["project_id", "gitlab_iid"]);
  pgm.createIndex("project_issues", "state");
  pgm.createIndex("project_issues", "author_email");
};

exports.down = (pgm) => {
  pgm.dropTable("project_issues");
};
