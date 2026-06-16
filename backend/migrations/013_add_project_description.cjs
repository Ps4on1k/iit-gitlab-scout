exports.up = (pgm) => {
  pgm.addColumn("projects", {
    description: { type: "text", notNull: false, default: "" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("projects", "description");
};
