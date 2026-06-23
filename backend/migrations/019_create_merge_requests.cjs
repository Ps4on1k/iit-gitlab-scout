exports.up = (pgm) => {
  pgm.createTable("project_merge_requests", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true, references: "projects(id)", onDelete: "CASCADE" },
    gitlab_iid: { type: "integer", notNull: true },
    title: { type: "text", notNull: true },
    state: { type: "text", notNull: true },
    author_name: { type: "text", default: "''" },
    author_email: { type: "text", default: "''" },
    source_branch: { type: "text", default: "''" },
    target_branch: { type: "text", default: "''" },
    created_at: { type: "timestamptz" },
    updated_at: { type: "timestamptz" },
    merged_at: { type: "timestamptz" },
    closed_at: { type: "timestamptz" },
    merged_by: { type: "text", default: "''" },
    reviewers: { type: "text[]", default: "{}" },
    approvals: { type: "integer", default: 0 },
    changes_count: { type: "integer", default: 0 },
    comments_count: { type: "integer", default: 0 },
  });

  pgm.createIndex("project_merge_requests", "project_id");
  pgm.createIndex("project_merge_requests", ["project_id", "gitlab_iid"], { unique: true });
};

exports.down = (pgm) => {
  pgm.dropTable("project_merge_requests");
};
