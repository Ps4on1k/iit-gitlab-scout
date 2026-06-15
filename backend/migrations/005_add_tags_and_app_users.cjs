exports.up = async (pgm) => {
  pgm.addColumn("projects", {
    tag: { type: "text", notNull: true, default: "''" },
  });

  pgm.createTable("app_users", {
    id: { type: "serial", primaryKey: true },
    username: { type: "text", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    role: { type: "text", notNull: true, default: "'user'" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("app_users");
  pgm.dropColumn("projects", "tag");
};
