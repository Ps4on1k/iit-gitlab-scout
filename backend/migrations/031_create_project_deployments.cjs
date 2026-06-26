exports.up = async function(pgm) {
  await pgm.createTable("project_deployments", {
    id: { type: "serial", primaryKey: true },
    project_id: { type: "integer", notNull: true },
    gitlab_deployment_id: { type: "integer", notNull: true },
    status: { type: "text", notNull: true },
    ref: { type: "text", default: "''" },
    environment: { type: "text", default: "''" },
    pipeline_id: { type: "integer" },
    pipeline_status: { type: "text" },
    created_at: { type: "timestamptz" },
    finished_at: { type: "timestamptz" },
    raw_json: { type: "jsonb", default: "{}" },
  });

  await pgm.addConstraint("project_deployments", "project_deployments_project_gitlab_unique", {
    unique: ["project_id", "gitlab_deployment_id"],
  });

  await pgm.addIndex("project_deployments", ["project_id"]);
  await pgm.addIndex("project_deployments", ["project_id", "environment"]);
  await pgm.addIndex("project_deployments", ["project_id", "status"]);
  await pgm.addIndex("project_deployments", ["created_at"]);
};

exports.down = async function(pgm) {
  await pgm.dropTable("project_deployments");
};
