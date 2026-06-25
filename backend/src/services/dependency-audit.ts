import { getPool } from "../db/pool.js";
import { resolveProjectToken } from "../utils/project-token.js";
import { GitLabClient } from "./gitlab-client.js";

export async function collectDependenciesAudit(projectId: number): Promise<{ total: number; outdated: number }> {
  const pool = getPool();
  const { token, baseUrl } = await resolveProjectToken(projectId);

  const client = new GitLabClient({ token, baseUrl });

  // Get tree to find dependency files
  const tree = await client.getTree(projectId, "", "main", true);
  const depFiles = tree.filter(
    (item) => item.type === "blob" && ["package.json", "go.mod", "requirements.txt", "Cargo.toml"].includes(item.name)
  );

  const deps: { name: string; current_version: string; source: string }[] = [];

  for (const file of depFiles) {
    if (file.size && file.size > 1024 * 1024) continue;
    try {
      const content = await client.getFile(projectId, file.path, "main");
      const parsed = parseDepFile(file.name, content);
      deps.push(...parsed);
    } catch {
      continue;
    }
  }

  await pool.query("DELETE FROM project_dependencies_audit WHERE project_id = $1", [projectId]);

  let outdated = 0;
  for (const dep of deps) {
    // Simple heuristic: if version contains "latest" or is empty, mark as outdated
    const isOutdated = !dep.current_version || dep.current_version === "latest";
    if (isOutdated) outdated++;

    await pool.query(
      `INSERT INTO project_dependencies_audit (project_id, name, current_version, is_outdated, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, dep.name, dep.current_version, isOutdated, dep.source]
    );
  }

  return { total: deps.length, outdated };
}

function parseDepFile(fileName: string, content: string): { name: string; current_version: string; source: string }[] {
  const deps: { name: string; current_version: string; source: string }[] = [];

  if (fileName === "package.json") {
    try {
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name, version] of Object.entries(allDeps || {})) {
        deps.push({ name, current_version: String(version), source: "npm" });
      }
    } catch {}
  } else if (fileName === "requirements.txt") {
    content.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("-")).forEach((line) => {
      const match = line.match(/^([a-zA-Z0-9_.-]+)\s*[=<>!~]+\s*(.+)/);
      if (match) deps.push({ name: match[1], current_version: match[2].trim(), source: "pip" });
      else if (line.trim()) deps.push({ name: line.trim(), current_version: "*", source: "pip" });
    });
  } else if (fileName === "go.mod") {
    const requireBlock = content.match(/require\s*\([\s\S]*?\)/);
    if (requireBlock) {
      requireBlock[0].split("\n").forEach((line) => {
        const match = line.trim().match(/^([\w./-]+)\s+(\S+)/);
        if (match && !match[1].startsWith("//")) deps.push({ name: match[1], current_version: match[2], source: "go" });
      });
    }
  }

  return deps;
}
