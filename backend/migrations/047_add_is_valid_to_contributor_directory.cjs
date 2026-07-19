exports.up = async function(pgm) {
  // Column and index already exist (created manually), skip migration
  // This migration is a no-op
};

exports.down = async function(pgm) {
  // No-op - column was created manually
};
