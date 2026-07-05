exports.up = async function(pgm) {
  await pgm.createTable("dependency_catalog", {
    id: { type: "serial", primaryKey: true },
    ecosystem: { type: "text", notNull: true },
    language: { type: "text", notNull: true },
    framework: { type: "text" },
    file_names: { type: "text[]", notNull: true },
    dependency_field: { type: "text" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", default: "now()" },
    updated_at: { type: "timestamptz", default: "now()" },
  });

  await pgm.sql(`
    INSERT INTO dependency_catalog (ecosystem, language, framework, file_names, dependency_field) VALUES
    ('npm', 'TypeScript', 'React', ARRAY['package.json'], 'dependencies'),
    ('npm', 'TypeScript', 'Angular', ARRAY['package.json'], 'dependencies'),
    ('npm', 'TypeScript', 'Vue', ARRAY['package.json'], 'dependencies'),
    ('npm', 'JavaScript', 'Node.js', ARRAY['package.json'], 'dependencies'),
    ('npm', 'JavaScript', 'Express', ARRAY['package.json'], 'dependencies'),
    ('pip', 'Python', 'Django', ARRAY['requirements.txt', 'setup.py', 'pyproject.toml'], NULL),
    ('pip', 'Python', 'Flask', ARRAY['requirements.txt', 'setup.py', 'pyproject.toml'], NULL),
    ('pip', 'Python', 'FastAPI', ARRAY['requirements.txt', 'pyproject.toml'], NULL),
    ('pip', 'Python', NULL, ARRAY['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'], NULL),
    ('go', 'Go', 'Gin', ARRAY['go.mod'], NULL),
    ('go', 'Go', 'Echo', ARRAY['go.mod'], NULL),
    ('go', 'Go', NULL, ARRAY['go.mod'], NULL),
    ('cargo', 'Rust', 'Actix', ARRAY['Cargo.toml'], NULL),
    ('cargo', 'Rust', 'Axum', ARRAY['Cargo.toml'], NULL),
    ('cargo', 'Rust', NULL, ARRAY['Cargo.toml'], NULL),
    ('maven', 'Java', 'Spring', ARRAY['pom.xml'], NULL),
    ('maven', 'Java', NULL, ARRAY['pom.xml'], NULL),
    ('gradle', 'Java', 'Spring Boot', ARRAY['build.gradle', 'build.gradle.kts'], NULL),
    ('nuget', 'C#', '.NET', ARRAY['*.csproj'], NULL),
    ('composer', 'PHP', 'Laravel', ARRAY['composer.json'], NULL),
    ('pub', 'Dart', 'Flutter', ARRAY['pubspec.yaml'], NULL),
    ('swift-pm', 'Swift', 'SwiftUI', ARRAY['Package.swift'], NULL)
  `);
};

exports.down = async function(pgm) {
  await pgm.dropTable("dependency_catalog");
};
