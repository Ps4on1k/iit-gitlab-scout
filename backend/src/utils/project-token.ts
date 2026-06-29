import { getPool } from "../db/pool.js";
import { decrypt } from "./crypto.js";
import { GitLabClient } from "../services/gitlab-client.js";

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

export async function resolveProjectToken(projectId: number): Promise<{ token: string; baseUrl: string; path: string }> {
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

  return { token, baseUrl, path: proj.path };
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
