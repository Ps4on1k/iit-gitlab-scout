exports.up = async function(pgm) {
  await pgm.sql(`
    CREATE TABLE IF NOT EXISTS lineage_metadata (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT now(),
      UNIQUE(entity_type, entity_name)
    )
  `);

  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_lineage_metadata_type ON lineage_metadata (entity_type)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_lineage_metadata_name ON lineage_metadata (entity_name)`);
};

exports.down = async function(pgm) {
  await pgm.dropTable("lineage_metadata");
};
