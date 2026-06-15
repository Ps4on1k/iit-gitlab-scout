exports.up = (pgm) => {
  pgm.createTable("projects", {
    id: { type: "serial", primaryKey: true },
    path: { type: "text", notNull: true, unique: true },
    label: { type: "text", notNull: true },
    token_encrypted: { type: "text", notNull: true },
    base_url: { type: "text", notNull: true, default: "'https://gitlab.com/api/v4'" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("projects", "path");
};

exports.down = (pgm) => {
  pgm.dropTable("projects");
};
