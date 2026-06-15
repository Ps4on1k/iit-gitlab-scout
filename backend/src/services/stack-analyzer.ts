import type { GitLabClient } from "../services/gitlab-client.js";
import type {
  Dependency,
  DependencyFile,
  StackInfo,
} from "../models/responses.js";

const DEPENDENCY_FILES = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "go.mod",
  "go.sum",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "pyproject.toml",
  "setup.py",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",
  "mix.exs",
];

const LOCK_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "go.sum",
  "Pipfile.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
]);

const MAX_FILE_SIZE = 1024 * 1024;

function parsePackageJson(content: string): Dependency[] {
  const pkg = JSON.parse(content);
  const deps: Dependency[] = [];
  for (const [name, version] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    deps.push({ name, version: String(version) });
  }
  return deps;
}

function parseRequirementsTxt(content: string): Dependency[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("-"))
    .map((line) => {
      const match = line.match(/^([a-zA-Z0-9_.-]+)\s*([=<>!~]+)\s*(.+)/);
      if (match) return { name: match[1], version: `${match[2]}${match[3].trim()}` };
      return { name: line, version: "*" };
    });
}

function parseGoMod(content: string): Dependency[] {
  const deps: Dependency[] = [];
  const requireBlock = content.match(/require\s*\([\s\S]*?\)/);
  if (requireBlock) {
    const lines = requireBlock[0].split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed === "require (" || trimmed === ")") continue;
      const match = trimmed.match(/^([\w./-]+)\s+(\S+)/);
      if (match) {
        deps.push({ name: match[1], version: match[2] });
      }
    }
  }
  return deps;
}

function parseCargoToml(content: string): Dependency[] {
  const deps: Dependency[] = [];
  const section = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
  if (section) {
    const lines = section[1].split("\n");
    for (const line of lines) {
      const match = line.trim().match(/^(\w+)\s*=\s*"?([^"]+)"?/);
      if (match) deps.push({ name: match[1], version: match[2] });
    }
  }
  return deps;
}

function parseGradleKts(content: string): Dependency[] {
  const deps: Dependency[] = [];
  const depBlock = content.match(/dependencies\s*\{([\s\S]*?)\n\}/);
  if (!depBlock) return deps;
  const lines = depBlock[1].split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(\s*["']([^:]+):([^"']+)["']\s*\)/);
    if (match) {
      deps.push({ name: match[1], version: match[2] });
      continue;
    }
    const catalogMatch = trimmed.match(/(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(\s*libs\.([\w.]+)\s*\)/);
    if (catalogMatch) {
      deps.push({ name: `libs.${catalogMatch[1]}`, version: "*" });
    }
  }
  return deps;
}

function parseBuildGradle(content: string): Dependency[] {
  const deps: Dependency[] = [];
  const depBlock = content.match(/dependencies\s*\{([\s\S]*?)\n\}/);
  if (!depBlock) return deps;
  const lines = depBlock[1].split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+['"]([^:]+):([^'"]+)['"]/);
    if (match) {
      deps.push({ name: match[1], version: match[2] });
    }
  }
  return deps;
}

function parseGemfile(content: string): Dependency[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("gem "))
    .map((line) => {
      const match = line.match(/gem\s+["'](\w+)["']\s*,\s*["']([^"']+)["']/);
      if (match) return { name: match[1], version: match[2] };
      const nameOnly = line.match(/gem\s+["'](\w+)["']/);
      return { name: nameOnly?.[1] || "", version: "*" };
    })
    .filter((d) => d.name);
}

function parseLockFile(content: string): Dependency[] {
  const deps: Dependency[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.trim().match(/^(\S+)\s+\((.+)\)/);
    if (match) deps.push({ name: match[1], version: match[2] });
  }
  return deps;
}

const PARSERS: Record<
  string,
  (content: string) => Dependency[]
> = {
  "package.json": parsePackageJson,
  "package-lock.json": parseLockFile,
  "requirements.txt": parseRequirementsTxt,
  "Pipfile": (c) => {
    try {
      return parsePackageJson(c);
    } catch {
      return [];
    }
  },
  "go.mod": parseGoMod,
  "Cargo.toml": parseCargoToml,
  "build.gradle.kts": parseGradleKts,
  "build.gradle": parseBuildGradle,
  "Gemfile": parseGemfile,
  "Gemfile.lock": parseLockFile,
  "Pipfile.lock": (c) => {
    try {
      const data = JSON.parse(c);
      const deps: Dependency[] = [];
      for (const [name, info] of Object.entries(
        (data as Record<string, Record<string, { version: string }>>)
          .default || {}
      )) {
        deps.push({ name, version: (info as { version: string }).version });
      }
      return deps;
    } catch {
      return [];
    }
  },
};

function detectFileType(fileName: string): string {
  if (fileName === "package.json") return "npm";
  if (fileName.endsWith(".lock") || fileName === "package-lock.json")
    return "lockfile";
  if (fileName === "requirements.txt") return "pip";
  if (fileName === "Pipfile" || fileName === "Pipfile.lock") return "pipenv";
  if (fileName === "pyproject.toml") return "pyproject";
  if (fileName === "go.mod" || fileName === "go.sum") return "go";
  if (fileName === "Cargo.toml" || fileName === "Cargo.lock") return "cargo";
  if (fileName === "pom.xml") return "maven";
  if (fileName === "build.gradle" || fileName === "build.gradle.kts")
    return "gradle";
  if (fileName === "Gemfile" || fileName === "Gemfile.lock") return "rubygems";
  return "unknown";
}

export async function analyzeStack(
  client: GitLabClient,
  projectId: number,
  defaultBranch: string,
  language: string | null
): Promise<StackInfo> {
  const tree = await client.getTree(projectId, "", defaultBranch, true);

  const depFiles = tree.filter(
    (item) =>
      item.type === "blob" &&
      DEPENDENCY_FILES.includes(item.name) &&
      !LOCK_FILES.has(item.name)
  );

  const dependencyFiles: DependencyFile[] = [];

  for (const file of depFiles) {
    if (file.size && file.size > MAX_FILE_SIZE) continue;

    try {
      const content = await client.getFile(projectId, file.path, defaultBranch);
      const parser = PARSERS[file.name];
      const deps = parser ? parser(content) : [];
      dependencyFiles.push({
        file_path: file.path,
        file_type: detectFileType(file.name),
        dependencies: deps,
      });
    } catch {
      continue;
    }
  }

  const totalDependencies = dependencyFiles.reduce(
    (sum, f) => sum + f.dependencies.length,
    0
  );

  return {
    language,
    dependency_files: dependencyFiles,
    total_dependencies: totalDependencies,
  };
}
