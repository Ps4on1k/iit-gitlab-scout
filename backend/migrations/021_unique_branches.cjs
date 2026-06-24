exports.up = async (pgm) => {
  // Remove duplicate branches, keeping only the latest entry per (project_id, name)
  await pgm.db.query(`
    DELETE FROM project_branches pb
    WHERE pb.id NOT IN (
      SELECT MAX(id) FROM project_branches
      GROUP BY project_id, name
    )
  `);

  // Add unique constraint
  await pgm.db.query(`
    ALTER TABLE project_branches ADD CONSTRAINT project_branches_project_id_name_unique UNIQUE (project_id, name)
  `);
};

exports.down = async (pgm) => {
  await pgm.db.query(`ALTER TABLE project_branches DROP CONSTRAINT IF EXISTS project_branches_project_id_name_unique`);
};
