exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE project_branches ADD COLUMN IF NOT EXISTS last_commit_additions integer DEFAULT 0`);
  pgm.sql(`ALTER TABLE project_branches ADD COLUMN IF NOT EXISTS last_commit_deletions integer DEFAULT 0`);
};

exports.down = (pgm) => {
  pgm.dropColumn("project_branches", "last_commit_additions");
  pgm.dropColumn("project_branches", "last_commit_deletions");
};
