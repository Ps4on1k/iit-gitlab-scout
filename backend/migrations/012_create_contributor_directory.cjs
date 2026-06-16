exports.up = (pgm) => {
  pgm.createTable("contributor_directory", {
    id: { type: "serial", primaryKey: true },
    display_name: { type: "text", notNull: true },
    emails: { type: "text[]", notNull: true, default: "{}" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("contributor_directory", "display_name");
};

exports.down = (pgm) => {
  pgm.dropTable("contributor_directory");
};
