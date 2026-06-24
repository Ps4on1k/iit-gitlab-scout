exports.up = async (pgm) => {
  // Add new tags column as text array
  await pgm.db.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'`);

  // Copy existing single tag values into tags array
  await pgm.db.query(`UPDATE projects SET tags = ARRAY[tag] WHERE tag IS NOT NULL AND tag != ''`);

  // Add unique index on tag column for array overlap queries
  await pgm.db.query(`CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN (tags)`);

  // Drop old column
  await pgm.db.query(`ALTER TABLE projects DROP COLUMN IF EXISTS tag`);
};

exports.down = async (pgm) => {
  await pgm.db.query(`ALTER TABLE projects ADD COLUMN tag text DEFAULT ''`);
  await pgm.db.query(`UPDATE projects SET tag = tags[1] WHERE array_length(tags, 1) > 0`);
  await pgm.db.query(`DROP INDEX IF EXISTS idx_projects_tags`);
  await pgm.db.query(`ALTER TABLE projects DROP COLUMN IF EXISTS tags`);
};
