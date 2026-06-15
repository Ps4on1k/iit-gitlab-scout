import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { GitLabClient } from "../src/services/gitlab-client.js";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  let callIndex = 0;
  globalThis.fetch = vi.fn(async () => {
    const resp = responses[Math.min(callIndex++, responses.length - 1)];
    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers: resp.headers || {},
    });
  }) as any;
}

const TOKEN = "test-token";

describe("GitLabClient", () => {
  it("sends PRIVATE-TOKEN header", async () => {
    mockFetch([{ status: 200, body: { id: 1 } }]);
    const client = new GitLabClient({ token: TOKEN });

    await client.request("/test");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "PRIVATE-TOKEN": TOKEN }),
      })
    );
  });

  it("returns parsed JSON", async () => {
    mockFetch([{ status: 200, body: { hello: "world" } }]);
    const client = new GitLabClient({ token: TOKEN });

    const result = await client.request<{ hello: string }>("/test");

    expect(result).toEqual({ hello: "world" });
  });

  it("throws on non-ok response after retries", async () => {
    vi.useFakeTimers();
    mockFetch([
      { status: 500, body: {} },
      { status: 500, body: {} },
      { status: 500, body: {} },
    ]);
    const client = new GitLabClient({ token: TOKEN });

    const promise = client.request("/test").catch((e) => e);
    await vi.advanceTimersByTimeAsync(60000);
    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain("GitLab API 500");
    vi.useRealTimers();
  });

  it("handles rate limit (429) with retry", async () => {
    mockFetch([
      { status: 429, body: {}, headers: { "retry-after": "0" } },
      { status: 200, body: { ok: true } },
    ]);
    const client = new GitLabClient({ token: TOKEN });

    const result = await client.request<{ ok: boolean }>("/test");

    expect(result.ok).toBe(true);
  });

  it("requestPaginated follows Link header", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("page=1")) {
        return new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: {
            link: '</api/v1/projects/1/commits?page=2>; rel="next"',
          },
        });
      }
      return new Response(JSON.stringify([{ id: 2 }]), { status: 200, headers: {} });
    }) as any;

    const client = new GitLabClient({ token: TOKEN });
    const result = await client.requestPaginated<{ id: number }>(
      "/projects/1/commits?per_page=100"
    );

    expect(result).toHaveLength(2);
  });

  it("getProject encodes path", async () => {
    mockFetch([{ status: 200, body: { id: 1, name: "test" } }]);
    const client = new GitLabClient({ token: TOKEN });

    await client.getProject("owner/repo");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/projects/owner%2Frepo"),
      expect.anything()
    );
  });

  it("getFile decodes base64 content", async () => {
    const content = btoa("hello world");
    mockFetch([{ status: 200, body: { content } }]);
    const client = new GitLabClient({ token: TOKEN });

    const result = await client.getFile(1, "file.txt");

    expect(result).toBe("hello world");
  });
});
