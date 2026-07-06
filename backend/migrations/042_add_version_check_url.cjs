exports.up = async function(pgm) {
  await pgm.sql('ALTER TABLE dependency_catalog ADD COLUMN version_check_url text');
};

exports.down = async function(pgm) {
  await pgm.sql('ALTER TABLE dependency_catalog DROP COLUMN version_check_url');
};
