import { getPool } from "../db/pool.js";
import { decrypt } from "./crypto.js";

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

  if (!token && baseUrl) {
    const ptResult = await pool.query(
      "SELECT token_encrypted FROM personal_tokens WHERE base_url = $1 ORDER BY created_at DESC LIMIT 1",
      [baseUrl]
    );
    if (ptResult.rows.length > 0) {
      token = decrypt(ptResult.rows[0].token_encrypted);
    }
  }

  return { token, baseUrl, path: proj.path };
}
