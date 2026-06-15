import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitLabTreeItem } from "../src/models/gitlab.js";

vi.mock("../src/config.js", () => ({
  getEnv: () => ({
    GITLAB_TOKEN: "test-token",
    GITLAB_BASE_URL: "https://gitlab.example.com/api/v4",
    REQUEST_TIMEOUT: 5000,
    RATE_LIMIT_RPS: 10,
    CACHE_TTL: 300,
  }),
}));

import { analyzeStack } from "../src/services/stack-analyzer.js";

const mockClient = {
  getTree: vi.fn(),
  getFile: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function treeItem(name: string, size?: number): GitLabTreeItem {
  return { id: "1", name, type: "blob", path: name, size };
}

describe("analyzeStack", () => {
  it("parses package.json", async () => {
    mockClient.getTree.mockResolvedValue([treeItem("package.json")]);
    mockClient.getFile.mockResolvedValue(
      JSON.stringify({
        dependencies: { react: "^18.0.0", vue: "^3.0.0" },
        devDependencies: { vite: "^5.0.0" },
      })
    );

    const result = await analyzeStack(mockClient as any, 1, "main", "TypeScript");

    expect(result.language).toBe("TypeScript");
    expect(result.dependency_files).toHaveLength(1);
    expect(result.total_dependencies).toBe(3);
    const pkg = result.dependency_files[0];
    expect(pkg.file_type).toBe("npm");
    expect(pkg.dependencies.map((d) => d.name)).toEqual(
      expect.arrayContaining(["react", "vue", "vite"])
    );
  });

  it("parses requirements.txt", async () => {
    mockClient.getTree.mockResolvedValue([treeItem("requirements.txt")]);
    mockClient.getFile.mockResolvedValue(
      "fastapi==0.100.0\nuvicorn>=0.23.0\n# comment\n\npydantic\n"
    );

    const result = await analyzeStack(mockClient as any, 1, "main", "Python");

    expect(result.dependency_files).toHaveLength(1);
    expect(result.total_dependencies).toBe(3);
    const deps = result.dependency_files[0].dependencies;
    expect(deps.find((d) => d.name === "fastapi")?.version).toBe("==0.100.0");
  });

  it("parses go.mod", async () => {
    mockClient.getTree.mockResolvedValue([treeItem("go.mod")]);
    mockClient.getFile.mockResolvedValue(`module example.com/foo

require (
  github.com/gin-gonic/gin v1.9.0
  github.com/stretchr/testify v1.8.0
)
`);

    const result = await analyzeStack(mockClient as any, 1, "main", "Go");

    expect(result.total_dependencies).toBe(2);
  });

  it("parses Cargo.toml", async () => {
    mockClient.getTree.mockResolvedValue([treeItem("Cargo.toml")]);
    mockClient.getFile.mockResolvedValue(`[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }
`);

    const result = await analyzeStack(mockClient as any, 1, "main", "Rust");

    expect(result.total_dependencies).toBe(2);
  });

  it("skips files larger than 1MB", async () => {
    mockClient.getTree.mockResolvedValue([
      treeItem("package.json", 1024 * 1024 + 1),
    ]);

    const result = await analyzeStack(mockClient as any, 1, "main", null);

    expect(result.dependency_files).toHaveLength(0);
    expect(result.total_dependencies).toBe(0);
  });

  it("skips unknown files", async () => {
    mockClient.getTree.mockResolvedValue([treeItem("README.md")]);

    const result = await analyzeStack(mockClient as any, 1, "main", null);

    expect(result.dependency_files).toHaveLength(0);
  });

  it("handles getFile errors gracefully", async () => {
    mockClient.getTree.mockResolvedValue([treeItem("package.json")]);
    mockClient.getFile.mockRejectedValue(new Error("not found"));

    const result = await analyzeStack(mockClient as any, 1, "main", null);

    expect(result.dependency_files).toHaveLength(0);
  });

  it("skips lock files", async () => {
    mockClient.getTree.mockResolvedValue([
      treeItem("package-lock.json"),
      treeItem("package.json"),
    ]);
    mockClient.getFile.mockResolvedValue(
      JSON.stringify({ dependencies: { lodash: "^4.0.0" } })
    );

    const result = await analyzeStack(mockClient as any, 1, "main", null);

    expect(result.dependency_files).toHaveLength(1);
    expect(result.dependency_files[0].file_path).toBe("package.json");
  });
});
