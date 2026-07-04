exports.up = async function(pgm) {
  await pgm.addColumn("app_users", {
    token_version: { type: "integer", notNull: true, default: 1 },
  });
};

exports.down = async function(pgm) {
  await pgm.dropColumn("app_users", "token_version");
};
