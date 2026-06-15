exports.up = async (pgm) => {
  pgm.createTable("users", {
    id: { type: "serial", primaryKey: true },
    username: { type: "text", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    role: { type: "text", notNull: true, default: "'user'" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.sql(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'))`);

  pgm.sql(`INSERT INTO users (username, password_hash, role) VALUES ('admin', '$2b$10$4zR6z.m1tebRjo3DY1CaP.FLRKv/o3Rq5GeCLYZ0xV91IkOyD/z.m', 'admin')`);
  pgm.sql(`INSERT INTO users (username, password_hash, role) VALUES ('user', '$2b$10$MmTOU0HfPrOVOIfqCLIqaOksNIyjFGF/3eAJVgP5yCYtTfb.Dyftu', 'user')`);
};

exports.down = (pgm) => {
  pgm.dropTable("users");
};
