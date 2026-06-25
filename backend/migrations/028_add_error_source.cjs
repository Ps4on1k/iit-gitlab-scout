exports.up = async (pgm) => {
  await pgm.db.query(`ALTER TABLE scheduler_errors ADD COLUMN IF NOT EXISTS source text DEFAULT 'scheduler'`);
};

exports.down = async (pgm) => {
  await pgm.db.query(`ALTER TABLE scheduler_errors DROP COLUMN IF EXISTS source`);
};
