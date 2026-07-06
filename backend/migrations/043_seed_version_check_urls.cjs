exports.up = async function(pgm) {
  await pgm.sql("UPDATE dependency_catalog SET version_check_url = 'https://registry.npmjs.org/{name}/latest' WHERE ecosystem = 'npm'");
  await pgm.sql("UPDATE dependency_catalog SET version_check_url = 'https://pypi.org/pypi/{name}/json' WHERE ecosystem = 'pip'");
  await pgm.sql("UPDATE dependency_catalog SET version_check_url = 'https://api.nuget.org/v3-flatcontainer/{name}/index.json' WHERE ecosystem = 'nuget'");
  await pgm.sql("UPDATE dependency_catalog SET version_check_url = 'https://proxy.golang.org/{name}/@latest' WHERE ecosystem = 'go'");
  await pgm.sql("UPDATE dependency_catalog SET version_check_url = 'https://search.maven.org/solrsearch/select?q=g:{group}+AND+a:{artifact}&rows=1&wt=json' WHERE ecosystem IN ('maven', 'gradle')");
};

exports.down = async function(pgm) {
  await pgm.sql("UPDATE dependency_catalog SET version_check_url = NULL");
};
