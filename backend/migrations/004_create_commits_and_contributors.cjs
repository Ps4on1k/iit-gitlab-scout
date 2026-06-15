exports.up = (pgm) => {
  pgm.createTable("commits", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true },
    commit_sha: { type: "text", notNull: true },
    author_name: { type: "text", notNull: true },
    author_email: { type: "text", notNull: true },
    committed_date: { type: "timestamptz", notNull: true },
    additions: { type: "integer", notNull: true, default: 0 },
    deletions: { type: "integer", notNull: true, default: 0 },
    total_changes: { type: "integer", notNull: true, default: 0 },
    branch: { type: "text", notNull: true },
    raw_json: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("commits", "project_id");
  pgm.createIndex("commits", "author_email");
  pgm.createIndex("commits", "committed_date");
  pgm.createIndex("commits", ["project_id", "commit_sha"], { unique: true });

  pgm.createTable("contributor_profiles", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true },
    author_email: { type: "text", notNull: true },
    author_name: { type: "text", notNull: true },
    total_commits: { type: "integer", notNull: true, default: 0 },
    total_additions: { type: "integer", notNull: true, default: 0 },
    total_deletions: { type: "integer", notNull: true, default: 0 },
    total_changes: { type: "integer", notNull: true, default: 0 },
    first_commit_date: { type: "timestamptz", notNull: true },
    last_commit_date: { type: "timestamptz", notNull: true },
    frequency: { type: "jsonb", notNull: true, default: "{}" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("contributor_profiles", "project_id");
  pgm.createIndex("contributor_profiles", "author_email");
  pgm.createIndex("contributor_profiles", ["project_id", "author_email"], { unique: true });
};

exports.down = (pgm) => {
  pgm.dropTable("contributor_profiles");
  pgm.dropTable("commits");
};
