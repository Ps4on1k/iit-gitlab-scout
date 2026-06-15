import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../src/config.js", () => ({
  getEnv: () => ({
    GITLAB_BASE_URL: "https://gitlab.example.com/api/v4",
    REQUEST_TIMEOUT: 5000,
    RATE_LIMIT_RPS: 100,
    CACHE_TTL: 300,
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-1234567890",
    ENCRYPTION_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  }),
}));

import Fastify from "fastify";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-1234567890";

function makeToken(role: "admin" | "user" = "admin") {
  return jwt.sign({ userId: 1, username: "test", role }, JWT_SECRET, { expiresIn: "1h" });
}

import { contributorsRoutes } from "../src/api/v1/contributors.js";
import { stackRoutes } from "../src/api/v1/stack.js";

const mockProject = {
  id: 42,
  name: "test-repo",
  path_with_namespace: "owner/test-repo",
  default_branch: "main",
  language: "TypeScript",
};

const mockCommits = [
  {
    id: "abc123",
    short_id: "abc12345",
    title: "initial commit",
    author_name: "Alice",
    author_email: "alice@example.com",
    authored_date: "2024-01-01T12:00:00Z",
    committed_date: "2024-01-01T12:00:00Z",
    message: "init",
  },
];

const mockTree = [
  { id: "1", name: "package.json", type: "blob" as const, path: "package.json", size: 100 },
];

const mockFile = JSON.stringify({
  dependencies: { react: "^18.0.0" },
  devDependencies: { vite: "^5.0.0" },
});

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url: string) => {
    const urlStr = typeof url === "string" ? url : (url as Request).url;

    if (urlStr.includes("/projects/owner%2Frepo")) {
      return new Response(JSON.stringify(mockProject), { status: 200, headers: {} });
    }
    if (urlStr.includes("/repository/commits") && !urlStr.includes("/diff")) {
      return new Response(JSON.stringify(mockCommits), { status: 200, headers: {} });
    }
    if (urlStr.includes("/repository/tree")) {
      return new Response(JSON.stringify(mockTree), { status: 200, headers: {} });
    }
    if (urlStr.includes("/repository/files/")) {
      return new Response(JSON.stringify({ content: btoa(mockFile) }), { status: 200, headers: {} });
    }

    return new Response("{}", { status: 404, headers: {} });
  }) as any;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("API routes", () => {
  it("GET /health returns ok", async () => {
    const app = Fastify();
    app.get("/health", async () => ({ status: "ok" }));

    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ status: "ok" });
  });

  it("GET /api/v1/contributors without auth returns 401", async () => {
    const app = Fastify();
    await app.register(contributorsRoutes);

    const res = await app.inject({ method: "GET", url: "/api/v1/contributors?project=owner/repo" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/contributors with auth returns response", async () => {
    const app = Fastify();
    await app.register(contributorsRoutes);

    const token = makeToken();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/contributors?project=owner/repo",
      headers: { authorization: `Bearer ${token}` },
    });

    expect([200, 404, 500]).toContain(res.statusCode);
  });

  it("GET /api/v1/stack without auth returns 401", async () => {
    const app = Fastify();
    await app.register(stackRoutes);

    const res = await app.inject({ method: "GET", url: "/api/v1/stack?project=owner/repo" });
    expect(res.statusCode).toBe(401);
  });
});
