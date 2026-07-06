exports.up = async function(pgm) {
  await pgm.addColumn("dependency_catalog", "version_check_url", { type: "text" });

  await pgm.sql(`
    UPDATE dependency_catalog SET version_check_url = CASE
      WHEN ecosystem = 'npm' THEN 'https://registry.npmjs.org/{name}/latest'
      WHEN ecosystem = 'pip' THEN 'https://pypi.org/pypi/{name}/json'
      WHEN ecosystem = 'nuget' THEN 'https://api.nuget.org/v3-flatcontainer/{name}/index.json'
      WHEN ecosystem = 'go' THEN 'https://proxy.golang.org/{name}/@latest'
      WHEN ecosystem = 'maven' THEN 'https://search.maven.org/solrsearch/select?q=g:{group}+AND+a:{artifact}&rows=1&wt=json'
      ELSE NULL
    END
    WHERE version_check_url IS NULL
  `);
};

exports.down = async function(pgm) {
  await pgm.dropColumn("dependency_catalog", "version_check_url");
};
