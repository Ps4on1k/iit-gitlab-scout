import { describe, it, expect, vi, beforeEach } from "vitest";

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

const mockResponses: { match: (sql: string) => boolean; result: any }[] = [];
const mockQuery = vi.fn().mockImplementation((sql: string) => {
  for (const entry of mockResponses) {
    if (entry.match(sql)) return Promise.resolve(entry.result);
  }
  if (sql.includes("token_version")) return Promise.resolve({ rows: [{ token_version: 1 }] });
  return Promise.resolve({ rows: [] });
});
vi.mock("../src/db/pool.js", () => ({
  getPool: () => ({ query: mockQuery }),
}));

import Fastify from "fastify";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-1234567890";
function makeToken(role: "admin" | "user" = "admin") {
  return jwt.sign({ userId: 1, username: "test", role, tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });
}

import { dataLineageRoutes } from "../src/api/v1/data-lineage.js";
import { dataCollectionRoutes } from "../src/api/v1/data-collection.js";

function mockSql(match: string, result: any) {
  mockResponses.push({ match: (sql) => sql.includes(match), result });
}

function clearMocks() {
  mockResponses.length = 0;
}

describe("Data Lineage API", () => {
  let app: any;

  beforeEach(() => {
    clearMocks();
    app = Fastify();
    app.register(dataLineageRoutes);
  });

  it("GET /api/v1/data-lineage/flow returns lineage data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/data-lineage/flow",
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.data.collectors).toBeDefined();
    expect(body.data.tables).toBeDefined();
    expect(Object.keys(body.data.collectors).length).toBeGreaterThan(0);
  });

  it("GET /api/v1/data-lineage/flow requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/data-lineage/flow" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/data-lineage/table/:name returns table details with fields", async () => {
    mockSql("pg_stat_user_tables", { rows: [{ n_live_tup: 1000, size: "1024 kB" }] });
    mockSql("MAX(committed_date)", { rows: [{ last: "2025-01-01T00:00:00Z" }] });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/data-lineage/table/commits",
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe("commits");
    expect(body.data.fields).toBeDefined();
    expect(body.data.fields.length).toBeGreaterThan(0);
    expect(body.data.stats.rowCount).toBe(1000);
  });

  it("GET /api/v1/data-lineage/table/:name returns 404 for unknown table", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/data-lineage/table/nonexistent",
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/v1/data-lineage/stats returns table statistics", async () => {
    mockSql("pg_stat_user_tables", {
      rows: [
        { tablename: "commits", n_live_tup: 5000, size: "10 MB" },
        { tablename: "project_branches", n_live_tup: 200, size: "512 kB" },
      ],
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/data-lineage/stats",
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.data.totalCollectors).toBeGreaterThan(0);
    expect(body.data.totalTables).toBeGreaterThan(0);
  });
});

describe("Data Collection API", () => {
  let app: any;

  beforeEach(() => {
    clearMocks();
    app = Fastify();
    app.register(dataCollectionRoutes);
  });

  it("GET /api/v1/data-collection/stats returns collection statistics", async () => {
    let queryIndex = 0;
    const queryResults = [
      { rows: [{ count: 10 }] },
      { rows: [{ count: 5000 }] },
      { rows: [{ count: 200 }] },
      { rows: [{ count: 1000 }] },
      { rows: [{ count: 300 }] },
      { rows: [{ count: 50 }] },
      { rows: [{ count: 100 }] },
      { rows: [{ count: 200 }] },
      { rows: [{ count: 30 }] },
      { rows: [{ count: 365 }] },
      { rows: [{ last: "2025-01-01T00:00:00Z" }] },
      { rows: [{ last: "2025-01-01T00:00:00Z" }] },
      { rows: [{ last: "2025-01-01T00:00:00Z" }] },
      { rows: [{ last: null }] },
      { rows: [{ count: 0 }] },
      { rows: [{ task_name: "collect_stack", last_run_at: null, enabled: true }] },
    ];

    mockQuery.mockReset().mockImplementation((sql: string) => {
      if (sql.includes("token_version")) return Promise.resolve({ rows: [{ token_version: 1 }] });
      const result = queryResults[queryIndex] || { rows: [] };
      queryIndex++;
      return Promise.resolve(result);
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/data-collection/stats",
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.data.projects).toBe(10);
    expect(body.data.records.commits).toBe(5000);
    expect(body.data.errors24h).toBe(0);
  });

  it("GET /api/v1/data-collection/health returns healthy when data is fresh", async () => {
    let queryIndex = 0;
    const now = new Date().toISOString();
    const queryResults = [
      { rows: [{ last_update: now }] },
      { rows: [{ last_update: now }] },
      { rows: [{ last_update: now }] },
      { rows: [{ last_update: now }] },
      { rows: [{ count: 0 }] },
    ];

    mockQuery.mockReset().mockImplementation((sql: string) => {
      if (sql.includes("token_version")) return Promise.resolve({ rows: [{ token_version: 1 }] });
      const result = queryResults[queryIndex] || { rows: [] };
      queryIndex++;
      return Promise.resolve(result);
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/data-collection/health",
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.data.health).toBe("healthy");
  });

  it("GET /api/v1/data-collection/health detects stale data", async () => {
    let queryIndex = 0;
    const staleDate = new Date(Date.now() - 31 * 86400000).toISOString();
    const queryResults = [
      { rows: [{ last_update: staleDate }] },
      { rows: [{ last_update: new Date().toISOString() }] },
      { rows: [{ last_update: new Date().toISOString() }] },
      { rows: [{ last_update: new Date().toISOString() }] },
      { rows: [{ count: 0 }] },
    ];

    mockQuery.mockReset().mockImplementation((sql: string) => {
      if (sql.includes("token_version")) return Promise.resolve({ rows: [{ token_version: 1 }] });
      const result = queryResults[queryIndex] || { rows: [] };
      queryIndex++;
      return Promise.resolve(result);
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/data-collection/health",
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.data.health).toBe("critical");
    expect(body.data.warnings.length).toBeGreaterThan(0);
  });
});
