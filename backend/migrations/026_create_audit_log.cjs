exports.up = (pgm) => {
  pgm.createTable("audit_log", {
    id: { type: "serial", primaryKey: true },
    user_id: { type: "integer", references: "users(id)", onDelete: "SET NULL" },
    action: { type: "text", notNull: true },
    details: { type: "text", default: "''" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("audit_log", "user_id");
  pgm.createIndex("audit_log", "created_at");
};

exports.down = (pgm) => {
  pgm.dropTable("audit_log");
};
