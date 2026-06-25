exports.up = (pgm) => {
  pgm.createTable("personal_tokens", {
    id: { type: "serial", primaryKey: true },
    base_url: { type: "text", notNull: true },
    token_encrypted: { type: "text", notNull: true },
    label: { type: "text", default: "''" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("personal_tokens", "base_url");
};

exports.down = (pgm) => {
  pgm.dropTable("personal_tokens");
};
