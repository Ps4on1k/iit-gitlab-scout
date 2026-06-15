import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitLabCommit } from "../src/models/gitlab.js";

vi.mock("../src/config.js", () => ({
  getEnv: () => ({
    GITLAB_TOKEN: "test-token",
    GITLAB_BASE_URL: "https://gitlab.example.com/api/v4",
    REQUEST_TIMEOUT: 5000,
    RATE_LIMIT_RPS: 10,
    CACHE_TTL: 300,
  }),
}));

import { getContributorStats } from "../src/services/contributor-stats.js";
import type { ContributorFilters } from "../src/services/contributor-stats.js";

function makeCommits(n: number, author = "Alice"): GitLabCommit[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `sha-${i}`,
    short_id: `sha-${i}`.slice(0, 8),
    title: `commit ${i}`,
    author_name: author,
    author_email: `${author.toLowerCase()}@example.com`,
    authored_date: `2024-01-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
    committed_date: `2024-01-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
    message: `msg ${i}`,
  }));
}

const mockClient = {
  getCommits: vi.fn(),
  getCommitDiff: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getContributorStats", () => {
  it("aggregates commits per author", async () => {
    const commits = [
      ...makeCommits(3, "Alice"),
      ...makeCommits(2, "Bob"),
    ];
    mockClient.getCommits.mockResolvedValue(commits);

    const result = await getContributorStats(mockClient as any, 1, {});

    expect(result).toHaveLength(2);
    const alice = result.find((r) => r.author_name === "Alice");
    expect(alice?.total_commits).toBe(3);
    const bob = result.find((r) => r.author_name === "Bob");
    expect(bob?.total_commits).toBe(2);
  });

  it("filters by author", async () => {
    const commits = [...makeCommits(2, "Alice"), ...makeCommits(2, "Bob")];
    mockClient.getCommits.mockResolvedValue(commits);

    const result = await getContributorStats(mockClient as any, 1, {
      author: "Alice",
    });

    expect(result).toHaveLength(1);
    expect(result[0].author_name).toBe("Alice");
  });

  it("computes frequency by day", async () => {
    const commits = makeCommits(3, "Alice");
    mockClient.getCommits.mockResolvedValue(commits);

    const result = await getContributorStats(mockClient as any, 1, {});
    const alice = result[0];

    expect(Object.keys(alice.frequency)).toHaveLength(3);
    expect(alice.frequency["2024-01-01"]).toBe(1);
  });

  it("returns empty for no commits", async () => {
    mockClient.getCommits.mockResolvedValue([]);

    const result = await getContributorStats(mockClient as any, 1, {});
    expect(result).toEqual([]);
  });

  it("passes month filter to getCommits", async () => {
    mockClient.getCommits.mockResolvedValue([]);

    await getContributorStats(mockClient as any, 1, { month: "2024-03" });

    expect(mockClient.getCommits).toHaveBeenCalledWith(
      1,
      "2024-03-01T00:00:00Z",
      "2024-03-28T23:59:59Z"
    );
  });
});
