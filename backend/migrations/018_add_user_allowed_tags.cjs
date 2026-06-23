exports.up = async (pgm) => {
  await pgm.db.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS allowed_tags text[] DEFAULT '{}'`);
};

exports.down = async (pgm) => {
  await pgm.db.query(`ALTER TABLE app_users DROP COLUMN IF EXISTS allowed_tags`);
};
