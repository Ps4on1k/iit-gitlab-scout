exports.up = async function(pgm) {
  await pgm.sql('ALTER TABLE projects ALTER COLUMN token_encrypted DROP NOT NULL');
  await pgm.sql("ALTER TABLE projects ALTER COLUMN token_encrypted SET DEFAULT ''");
};

exports.down = async function(pgm) {
  await pgm.sql("UPDATE projects SET token_encrypted = '' WHERE token_encrypted IS NULL");
  await pgm.sql('ALTER TABLE projects ALTER COLUMN token_encrypted SET NOT NULL');
};
