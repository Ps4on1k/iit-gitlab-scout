exports.up = async function(pgm) {
  await pgm.createTable("filter_presets", {
    id: { type: "serial", primaryKey: true },
    user_id: { type: "integer", notNull: true, references: "app_users(id)", onDelete: "CASCADE" },
    name: { type: "text", notNull: true },
    filters: { type: "jsonb", notNull: true, default: "{}" },
    relative_days_from: { type: "integer" },
    relative_days_to: { type: "integer" },
    created_at: { type: "timestamptz", default: "now()" },
  });

  await pgm.addIndex("filter_presets", ["user_id"]);
};

exports.down = async function(pgm) {
  await pgm.dropTable("filter_presets");
};
