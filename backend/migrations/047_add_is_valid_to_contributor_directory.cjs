exports.up = async function(pgm) {
  // Change default from true to false
  await pgm.sql(`ALTER TABLE contributor_directory ALTER COLUMN is_valid SET DEFAULT false`);
};

exports.down = async function(pgm) {
  await pgm.sql(`ALTER TABLE contributor_directory ALTER COLUMN is_valid SET DEFAULT true`);
};
