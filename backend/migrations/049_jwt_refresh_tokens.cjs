// SEC-01: JWT Refresh tokens table
exports.up = (pgm) => {
  pgm.createTable("refresh_tokens", {
    id: { type: "serial", primaryKey: true },
    user_id: { type: "integer", notNull: true, references: "app_users(id)", onDelete: "CASCADE" },
    token_hash: { type: "text", notNull: true, unique: true },
    expires_at: { type: "timestamptz", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    revoked_at: { type: "timestamptz" },
    ip_address: { type: "inet" },
    user_agent: { type: "text" },
  });
  pgm.addIndex("refresh_tokens", ["user_id", "expires_at"]);
  pgm.addIndex("refresh_tokens", ["token_hash"]);
};

exports.down = (pgm) => {
  pgm.dropTable("refresh_tokens");
};