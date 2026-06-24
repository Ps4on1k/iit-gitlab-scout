exports.up = async (pgm) => {
  await pgm.db.query(`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_path_key`);
  await pgm.db.query(`ALTER TABLE projects ADD CONSTRAINT projects_path_base_url_unique UNIQUE (path, base_url)`);
};

exports.down = async (pgm) => {
  await pgm.db.query(`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_path_base_url_unique`);
  await pgm.db.query(`ALTER TABLE projects ADD CONSTRAINT projects_path_key UNIQUE (path)`);
};
