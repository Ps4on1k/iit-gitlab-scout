exports.up = async function(pgm) {
  // Drop old foreign key and create new one pointing to app_users
  await pgm.sql('ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey');
  await pgm.sql('ALTER TABLE audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL');
};

exports.down = async function(pgm) {
  await pgm.sql('ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey');
  await pgm.sql('ALTER TABLE audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
};
