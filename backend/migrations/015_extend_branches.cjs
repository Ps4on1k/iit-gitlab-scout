exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE project_branches ADD COLUMN IF NOT EXISTS last_commit_author_email text DEFAULT ''`);
  pgm.sql(`ALTER TABLE project_branches ADD COLUMN IF NOT EXISTS last_commit_message text DEFAULT ''`);
  pgm.sql(`ALTER TABLE project_branches ADD COLUMN IF NOT EXISTS first_commit_date timestamptz`);
  pgm.sql(`ALTER TABLE project_branches ADD COLUMN IF NOT EXISTS can_push boolean`);
};

exports.down = (pgm) => {
  pgm.dropColumn("project_branches", "last_commit_author_email");
  pgm.dropColumn("project_branches", "last_commit_message");
  pgm.dropColumn("project_branches", "first_commit_date");
  pgm.dropColumn("project_branches", "can_push");
};
