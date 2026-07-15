exports.up = async function(pgm) {
  await pgm.sql(`ALTER TABLE app_users ALTER COLUMN password_hash DROP NOT NULL`);
  await pgm.sql(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS external_provider text`);
  await pgm.sql(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS external_id text`);
  await pgm.sql(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name text`);
  await pgm.sql(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email text`);
  await pgm.sql(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_sso_login_at timestamptz`);
  await pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_external_id ON app_users (external_id) WHERE external_id IS NOT NULL`);
};

exports.down = async function(pgm) {
  await pgm.sql(`DROP INDEX IF EXISTS idx_app_users_external_id`);
  await pgm.sql(`ALTER TABLE app_users DROP COLUMN IF EXISTS last_sso_login_at`);
  await pgm.sql(`ALTER TABLE app_users DROP COLUMN IF EXISTS email`);
  await pgm.sql(`ALTER TABLE app_users DROP COLUMN IF EXISTS display_name`);
  await pgm.sql(`ALTER TABLE app_users DROP COLUMN IF EXISTS external_id`);
  await pgm.sql(`ALTER TABLE app_users DROP COLUMN IF EXISTS external_provider`);
  await pgm.sql(`ALTER TABLE app_users ALTER COLUMN password_hash SET NOT NULL`);
};
