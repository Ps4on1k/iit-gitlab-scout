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
        `${baseUrl}/projects/${encodeURIComponent(projectPath)}/repository/tree?path=&ref=${ref}&recursive=true&per_page=1000`,
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

  // Load file names from catalog
  const catalogResult = await pool.query("SELECT file_names FROM dependency_catalog WHERE is_active = true");
  const allFileNames = new Set<string>();
  const globPatterns: string[] = [];
  for (const row of catalogResult.rows) {
    for (const fn of row.file_names) {
      if (fn.includes("*")) {
        globPatterns.push(fn);
      } else {
        allFileNames.add(fn);
      }
    }
  }

  // Also include known dependency files as fallback
  const fallbackFiles = ["package.json", "go.mod", "requirements.txt", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "pubspec.yaml", "Package.swift"];
  for (const fn of fallbackFiles) allFileNames.add(fn);

  const depFiles = tree.filter(
    (item: any) => item.type === "blob" && (
      allFileNames.has(item.name) ||
      globPatterns.some((pattern) => {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
        const regex = new RegExp("^" + escaped + "$");
        return regex.test(item.name);
      })
    )
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

  // Deduplicate dependencies within the project
  const deduped = new Map<string, { name: string; current_version: string; source: string }>();
  for (const dep of deps) {
    const key = `${dep.name}@${dep.source}`;
    if (!deduped.has(key)) {
      deduped.set(key, dep);
    }
  }
  const uniqueDeps = Array.from(deduped.values());
  console.log(`[deps] ${projectPath}: ${uniqueDeps.length} unique dependencies after dedup`);

  await pool.query("DELETE FROM project_dependencies_audit WHERE project_id = $1", [projectId]);

  // Load version check URLs from catalog
  const urlResult = await pool.query("SELECT ecosystem, version_check_url FROM dependency_catalog WHERE version_check_url IS NOT NULL AND is_active = true");
  const urlTemplates: Record<string, string> = {};
  for (const row of urlResult.rows) {
    urlTemplates[row.ecosystem] = row.version_check_url;
  }

  // Check for outdated dependencies via public APIs
  const outdatedList = new Set<string>();
  for (const dep of uniqueDeps) {
    if (!dep.current_version || dep.current_version === "latest" || dep.current_version === "*") {
      outdatedList.add(`${dep.name}@${dep.source}`);
      continue;
    }
    const urlTemplate = urlTemplates[dep.source];
    if (!urlTemplate) continue;
    try {
      const latest = await checkLatestVersion(dep.name, dep.source, urlTemplate);
      if (latest && normalizeVersion(dep.current_version) !== normalizeVersion(latest)) {
        outdatedList.add(`${dep.name}@${dep.source}`);
      }
    } catch (err) {
      console.log(`[deps] version check failed for ${dep.name}: ${err}`);
    }
  }

  let outdated = 0;
  const depRows: any[][] = [];
  for (const dep of uniqueDeps) {
    const isOutdated = outdatedList.has(`${dep.name}@${dep.source}`);
    if (isOutdated) outdated++;
    depRows.push([projectId, dep.name, dep.current_version, isOutdated, dep.source]);
  }

  if (depRows.length > 0) {
    const { batchInsert } = await import("../utils/batch.js");
    const columns = ["project_id", "name", "current_version", "is_outdated", "source"];
    await batchInsert("project_dependencies_audit", columns, depRows);
  }

  return { total: uniqueDeps.length, outdated };
}

function parseDepFile(fileName: string, content: string): { name: string; current_version: string; source: string }[] {
  const deps: { name: string; current_version: string; source: string }[] = [];

  if (fileName === "package.json") {
    try {
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
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
  } else if (fileName === "Podfile.lock") {
    const inSpecs = content.includes("PODS:");
    if (inSpecs) {
      const specsSection = content.split("PODS:")[1]?.split("DEPENDENCIES:")[0] || "";
      const matches = specsSection.matchAll(/^\s+-\s+([^\s(]+)\s+\(([^)]+)\)/gm);
      for (const m of matches) {
        if (m[1] && m[2]) deps.push({ name: m[1], current_version: m[2], source: "cocoapods" });
      }
    }
  } else if (fileName === "Podfile") {
    const matches = content.matchAll(/pod\s+['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g);
    for (const m of matches) {
      deps.push({ name: m[1], current_version: m[2], source: "cocoapods" });
    }
  } else if (fileName === "build.gradle" || fileName === "build.gradle.kts") {
    const matches = content.matchAll(/(?:implementation|api|compile|testImplementation)\s+['"]([^'"]+):([^'"]+):([^'"]+)['"]/g);
    for (const m of matches) {
      deps.push({ name: `${m[1]}:${m[2]}`, current_version: m[3], source: "gradle" });
    }
    // Also handle version catalog references like libs.xxx
    const catalogMatches = content.matchAll(/(?:implementation|api|compile)\s+(libs\.[a-zA-Z0-9.]+)/g);
    for (const m of catalogMatches) {
      deps.push({ name: m[1], current_version: "catalog", source: "gradle" });
    }
  } else if (fileName === "libs.versions.toml") {
    const versions: Record<string, string> = {};
    const versionMatches = content.matchAll(/^([a-zA-Z0-9._-]+)\s*=\s*["']([^"']+)["']/gm);
    for (const m of versionMatches) {
      versions[m[1]] = m[2];
    }
    const depMatches = content.matchAll(/^([a-zA-Z0-9._-]+)\s*=\s*\{[^}]*module\s*=\s*["']([^"']+)["']\s*,\s*version\s*=\s*["']([^"']+)["']/gm);
    for (const m of depMatches) {
      const versionRef = m[3];
      const version = versionRef.startsWith("$") ? versions[versionRef.slice(1)] || versionRef : versionRef;
      deps.push({ name: m[2], current_version: version, source: "gradle" });
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
  } else if (fileName.endsWith(".csproj")) {
    const matches = content.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g);
    for (const m of matches) {
      deps.push({ name: m[1], current_version: m[2], source: "nuget" });
    }
  }

  return deps;
}

function normalizeVersion(v: string): string {
  return v.replace(/^v/i, "").replace(/^[=<>~^!]+\s*/, "");
}

async function checkLatestVersion(name: string, source: string, urlTemplate: string): Promise<string | null> {
  try {
    let url = urlTemplate.replace(/{name}/g, name);
    // Handle maven/gradle groupId:artifactId format
    if ((source === "maven" || source === "gradle") && name.includes(":")) {
      const [groupId, artifactId] = name.split(":");
      url = url.replace(/{group}/g, groupId).replace(/{artifact}/g, artifactId);
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();

    if (source === "npm") return data.version || null;
    if (source === "pip") return data.info?.version || null;
    if (source === "nuget") { const versions = data.versions || []; return versions[versions.length - 1] || null; }
    if (source === "go") return data.Version || null;
    if (source === "maven" || source === "gradle") return data.response?.docs?.[0]?.latestVersion || null;
  } catch {}
  return null;
}
