import { getPool } from "../db/pool.js";
import { decrypt } from "./crypto.js";
import { GitLabClient } from "../services/gitlab-client.js";

const BLOCKED_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/,
  /^fd/,
  /^fe80:/,
];

function isPrivateOrReservedHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "[::1]") {
    return true;
  }
  return BLOCKED_IP_RANGES.some((re) => re.test(hostname));
}

export function validateBaseUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, error: "Only HTTP and HTTPS protocols are allowed" };
  }

  if (isPrivateOrReservedHost(parsed.hostname)) {
    return { valid: false, error: "Private/reserved IP addresses are not allowed (SSRF protection)" };
  }

  if (parsed.port && !["80", "443", "8080", "8443", "3000"].includes(parsed.port)) {
    return { valid: false, error: `Port ${parsed.port} is not allowed` };
  }

  return { valid: true };
}

function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (!u.includes("/api/v4")) {
    u = u + "/api/v4";
  }
  return u;
}

export function resolveBaseUrl(rawUrl: string): string {
  return normalizeBaseUrl(rawUrl);
}

const tokenCache = new Map<number, { token: string; baseUrl: string; path: string; expiresAt: number }>();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function resolveProjectToken(projectId: number): Promise<{ token: string; baseUrl: string; path: string }> {
  const now = Date.now();
  const cached = tokenCache.get(projectId);
  if (cached && now < cached.expiresAt) return { token: cached.token, baseUrl: cached.baseUrl, path: cached.path };

  const pool = getPool();
  const projResult = await pool.query(
    "SELECT id, path, token_encrypted, base_url FROM projects WHERE id = $1",
    [projectId]
  );
  const proj = projResult.rows[0];
  if (!proj) throw new Error(`Project ${projectId} not found`);

  const baseUrl = normalizeBaseUrl(proj.base_url);
  let token = proj.token_encrypted ? decrypt(proj.token_encrypted) : "";

  if (!token && proj.base_url) {
    const ptResult = await pool.query(
      "SELECT token_encrypted FROM personal_tokens WHERE base_url = $1 ORDER BY created_at DESC LIMIT 1",
      [proj.base_url]
    );
    if (ptResult.rows.length > 0) {
      token = decrypt(ptResult.rows[0].token_encrypted);
    }
  }

  const result = { token, baseUrl, path: proj.path };
  tokenCache.set(projectId, { ...result, expiresAt: now + TOKEN_CACHE_TTL });
  return result;
}

export function invalidateTokenCache(projectId?: number): void {
  if (projectId !== undefined) {
    tokenCache.delete(projectId);
  } else {
    tokenCache.clear();
  }
}

export async function validateProjectToken(projectId: number): Promise<{ valid: boolean; error?: string }> {
  try {
    const { token, baseUrl } = await resolveProjectToken(projectId);
    if (!token) return { valid: false, error: "No token configured" };
    const client = new GitLabClient({ token, baseUrl });
    await client.request<any>("/user");
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
