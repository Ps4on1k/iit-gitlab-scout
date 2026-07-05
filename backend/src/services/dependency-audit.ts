import { getPool } from "../db/pool.js";
import { resolveProjectToken } from "../utils/project-token.js";
import { GitLabClient } from "./gitlab-client.js";

export async function collectDependenciesAudit(projectId: number): Promise<{ total: number; outdated: number }> {
  const pool = getPool();
  const { token, baseUrl, path: projectPath } = await resolveProjectToken(projectId);

  const client = new GitLabClient({ token, baseUrl });

  // Try main branch first, then master
  let tree: any[] = [];
  for (const ref of ["main", "master"]) {
    try {
      const res = await fetch(
        `${baseUrl}/projects/${encodeURIComponent(projectPath)}/repository/tree?path=&ref=${ref}&per_page=100`,
        {
          headers: { "PRIVATE-TOKEN": token, Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!res.ok) continue;
      const body = await res.json();
      // GitLab returns array directly for tree endpoint
      tree = Array.isArray(body) ? body : (body.tree || []);
      if (tree.length > 0) break;
    } catch {
      continue;
    }
  }

  if (tree.length === 0) {
    console.log(`[deps] ${projectPath}: no files found in tree`);
    return { total: 0, outdated: 0 };
  }

  const depFileNames = ["package.json", "go.mod", "requirements.txt", "Cargo.toml", "pom.xml", "build.gradle", "composer.json", "pubspec.yaml", "Package.swift"];
  const depFiles = tree.filter(
    (item: any) => item.type === "blob" && depFileNames.includes(item.name)
  );

  console.log(`[deps] ${projectPath}: found ${depFiles.length} dependency files out of ${tree.length} total`);

  const deps: { name: string; current_version: string; source: string }[] = [];

  for (const file of depFiles) {
    if (file.size && file.size > 1024 * 1024) {
      console.log(`[deps] ${projectPath}: skipping ${file.name} (too large: ${file.size})`);
      continue;
    }
    try {
      const res = await fetch(
        `${baseUrl}/projects/${encodeURIComponent(projectPath)}/repository/files/${encodeURIComponent(file.path)}?ref=main`,
        {
          headers: { "PRIVATE-TOKEN": token, Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!res.ok) {
        console.log(`[deps] ${projectPath}: ${file.name} returned ${res.status}`);
        continue;
      }
      const body = await res.json();
      const content = atob(body.content);
      const parsed = parseDepFile(file.name, content);
      console.log(`[deps] ${projectPath}: ${file.name} → ${parsed.length} deps`);
      deps.push(...parsed);
    } catch (err) {
      console.log(`[deps] ${projectPath}: failed to read ${file.name}: ${err}`);
      continue;
    }
  }

  console.log(`[deps] ${projectPath}: total ${deps.length} dependencies found`);

  await pool.query("DELETE FROM project_dependencies_audit WHERE project_id = $1", [projectId]);

  let outdated = 0;
  for (const dep of deps) {
    const isOutdated = !dep.current_version || dep.current_version === "latest" || dep.current_version === "*";
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
    } catch (err) {
      console.log(`[deps] package.json parse error: ${err}`);
    }
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
  } else if (fileName === "Cargo.toml") {
    const sections = content.split(/\[(?:dependencies|dev-dependencies|build-dependencies)/);
    for (const section of sections.slice(1)) {
      const matches = section.matchAll(/^([a-zA-Z0-9_-]+)\s*=\s*["{].*?["{]?\s*(?:version\s*=\s*["']([^"']+)["'])?/gm);
      for (const m of matches) {
        if (m[1] && m[2]) deps.push({ name: m[1], current_version: m[2], source: "cargo" });
      }
    }
  } else if (fileName === "pom.xml") {
    const matches = content.matchAll(/<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g);
    for (const m of matches) {
      deps.push({ name: `${m[1]}:${m[2]}`, current_version: m[3], source: "maven" });
    }
  } else if (fileName === "build.gradle" || fileName === "build.gradle.kts") {
    const matches = content.matchAll(/(?:implementation|api|compile)\s+['"]([^'"]+):([^'"]+):([^'"]+)['"]/g);
    for (const m of matches) {
      deps.push({ name: `${m[1]}:${m[2]}`, current_version: m[3], source: "gradle" });
    }
  } else if (fileName === "composer.json") {
    try {
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.require, ...pkg["require-dev"] };
      for (const [name, version] of Object.entries(allDeps || {})) {
        deps.push({ name, current_version: String(version), source: "composer" });
      }
    } catch (err) {
      console.log(`[deps] composer.json parse error: ${err}`);
    }
  } else if (fileName === "pubspec.yaml") {
    const matches = content.matchAll(/^  ([a-zA-Z0-9_]+):\s*(["']?[^"'\n]+["']?)/gm);
    for (const m of matches) {
      if (!m[1].startsWith("_") && !["name", "description", "version", "environment", "flutter", "sdk"].includes(m[1])) {
        deps.push({ name: m[1], current_version: m[2].replace(/['"]/g, ""), source: "pub" });
      }
    }
  } else if (fileName === "Package.swift") {
    const matches = content.matchAll(/\.package\s*\(\s*name:\s*["']([^"']+)["'].*?from:\s*["']([^"']+)["']/g);
    for (const m of matches) {
      deps.push({ name: m[1], current_version: m[2], source: "swift-pm" });
    }
  }

  return deps;
}
