exports.up = (pgm) => {
  pgm.addConstraint("contributor_directory", "contributor_directory_display_name_unique", {
    unique: ["display_name"],
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("contributor_directory", "contributor_directory_display_name_unique");
};
