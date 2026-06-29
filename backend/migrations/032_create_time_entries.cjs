exports.up = async function(pgm) {
  await pgm.createTable("time_entries", {
    id: { type: "serial", primaryKey: true },
    contributor_email: { type: "text", notNull: true },
    hours: { type: "numeric(7,2)", notNull: true },
    period_from: { type: "date", notNull: true },
    period_to: { type: "date", notNull: true },
    note: { type: "text", default: "''" },
    created_at: { type: "timestamptz", default: "now()" },
  });

  await pgm.addIndex("time_entries", ["contributor_email"]);
  await pgm.addIndex("time_entries", ["period_from", "period_to"]);
  await pgm.addIndex("time_entries", ["contributor_email", "period_from"]);
};

exports.down = async function(pgm) {
  await pgm.dropTable("time_entries");
};
