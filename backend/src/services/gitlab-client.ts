import type {
  GitLabCommit,
  GitLabCommitDiff,
  GitLabLink,
  GitLabProject,
  GitLabTreeItem,
} from "../models/gitlab.js";
import { getEnv } from "../config.js";

const LINK_RE = /<([^>]+)>;\s*rel="(\w+)"/;

export class GitLabClient {
  private token: string;
  private baseUrl: string;
  private timeout: number;
  private rps: number;
  private tokens: number;
  private lastRefill: number;
  private retryCount = 5;

  constructor(options: { token: string; baseUrl?: string }) {
    const env = getEnv();
    this.token = options.token || env.GITLAB_PERSONAL_TOKEN || "";
    this.baseUrl = options.baseUrl || env.GITLAB_BASE_URL;
    this.timeout = env.REQUEST_TIMEOUT;
    this.rps = Math.min(env.RATE_LIMIT_RPS, 2);
    this.tokens = this.rps;
    this.lastRefill = Date.now();
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.rps, this.tokens + elapsed * this.rps);
    this.lastRefill = now;
  }

  private async waitForToken(): Promise<void> {
    this.refillTokens();
    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.rps) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      this.tokens = 0;
      this.lastRefill = Date.now();
    } else {
      this.tokens -= 1;
    }
  }

  async request<T>(path: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      await this.waitForToken();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          headers: {
            "PRIVATE-TOKEN": this.token,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after") || Math.min(5 * (attempt + 1), 30));
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }

        if (!res.ok) {
          throw new Error(`GitLab API ${res.status}: ${res.statusText}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        clearTimeout(timer);
        lastError = err as Error;
        if (err instanceof DOMException && err.name === "AbortError") {
          continue;
        }
        const backoff = Math.pow(2, attempt) * 2000;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  async requestPaginated<T>(path: string, maxPages = 100): Promise<T[]> {
    const results: T[] = [];
    let url: string | null = `${this.baseUrl}${path}`;
    let retry429 = 0;

    for (let page = 0; page < maxPages && url; page++) {
      await this.waitForToken();
      const isAbsolute = url.startsWith("http");
      const fetchUrl = isAbsolute ? url : `${this.baseUrl}${url}`;
      const res = await fetch(fetchUrl, {
        headers: {
          "PRIVATE-TOKEN": this.token,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (res.status === 429) {
        retry429++;
        const retryAfter = Number(res.headers.get("retry-after") || Math.min(10 * retry429, 60));
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        page--;
        continue;
      }

      retry429 = 0;
      if (!res.ok) {
        throw new Error(`GitLab API ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as T[];
      results.push(...data);

      const linkHeader = res.headers.get("link") || "";
      const links = this.parseLinks(linkHeader);
      url = links.next ?? null;
    }

    return results;
  }

  private parseLinks(header: string): Record<string, string> {
    const links: Record<string, string> = {};
    for (const part of header.split(",")) {
      const match = part.trim().match(LINK_RE);
      if (match) {
        links[match[2]] = match[1];
      }
    }
    return links;
  }

  async getProject(projectPath: string): Promise<GitLabProject> {
    return this.request<GitLabProject>(
      `/projects/${encodeURIComponent(projectPath)}`
    );
  }

  async getCommits(
    projectId: number,
    since?: string,
    until?: string
  ): Promise<GitLabCommit[]> {
    const params = new URLSearchParams();
    params.set("with_stats", "true");
    if (since) params.set("since", since);
    if (until) params.set("until", until);
    const qs = params.toString();
    return this.requestPaginated<GitLabCommit>(
      `/projects/${projectId}/repository/commits?per_page=100&${qs}`
    );
  }

  async getCommitDiff(
    projectId: number,
    commitSha: string
  ): Promise<GitLabCommitDiff[]> {
    return this.request<GitLabCommitDiff[]>(
      `/projects/${projectId}/repository/commits/${commitSha}/diff`
    );
  }

  async getTree(
    projectId: number,
    path = "",
    ref = "main",
    recursive = true
  ): Promise<GitLabTreeItem[]> {
    const params = new URLSearchParams({
      path,
      ref,
      recursive: String(recursive),
    });
    return this.requestPaginated<GitLabTreeItem>(
      `/projects/${projectId}/repository/tree?${params}`
    );
  }

  async getFile(
    projectId: number,
    filePath: string,
    ref = "main"
  ): Promise<string> {
    await this.waitForToken();
    const params = new URLSearchParams({ ref });
    const res = await fetch(
      `${this.baseUrl}/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}?${params}`,
      {
        headers: {
          "PRIVATE-TOKEN": this.token,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      }
    );

    if (!res.ok) {
      throw new Error(`GitLab API ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { content: string };
    return atob(data.content);
  }
}
