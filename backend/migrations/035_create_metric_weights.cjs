exports.up = async function(pgm) {
  await pgm.createTable("metric_weights", {
    id: { type: "serial", primaryKey: true },
    metric_name: { type: "text", notNull: true, unique: true },
    weights: { type: "jsonb", notNull: true, default: "{}" },
    updated_at: { type: "timestamptz", default: "now()" },
  });

  await pgm.sql(`
    INSERT INTO metric_weights (metric_name, weights) VALUES
    ('contributor_score', '{"consistency": 25, "activity": 20, "impact": 20, "sizeQuality": 15, "deploy": 20}'),
    ('deploy_reliability', '{"successRate": 50, "coverage": 30, "volume": 20}')
  `);
};

exports.down = async function(pgm) {
  await pgm.dropTable("metric_weights");
};
