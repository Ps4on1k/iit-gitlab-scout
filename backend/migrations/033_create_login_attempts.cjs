exports.up = (pgm) => {
  pgm.createTable("login_attempts", {
    id: { type: "serial", primaryKey: true },
    username: { type: "text", notNull: true },
    ip_address: { type: "text", notNull: true },
    success: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("login_attempts", "username");
  pgm.createIndex("login_attempts", "ip_address");
  pgm.createIndex("login_attempts", "created_at");

  pgm.addColumns("app_users", {
    failed_login_attempts: { type: "integer", notNull: true, default: 0 },
    locked_until: { type: "timestamptz", notNull: false, default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("login_attempts");
  pgm.dropColumns("app_users", ["failed_login_attempts", "locked_until"]);
};
