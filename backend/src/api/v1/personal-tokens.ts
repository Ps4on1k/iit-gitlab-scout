import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { GitLabClient } from "../../services/gitlab-client.js";
import { safeErrorMessage } from "../../utils/safe-error.js";

function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (!u.includes("/api/v4")) {
    u = u + "/api/v4";
  }
  return u;
}

export async function personalTokenRoutes(app: FastifyInstance) {
  // List personal tokens
  app.get("/api/v1/personal-tokens", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query(
      "SELECT id, base_url, label, created_at FROM personal_tokens ORDER BY created_at DESC"
    );
    return { ok: true, data: result.rows };
  });

  // Create personal token
  app.post<{
    Body: { base_url: string; token: string; label?: string };
  }>("/api/v1/personal-tokens", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { base_url, token, label } = request.body;
    if (!base_url || !token) {
      return reply.status(400).send({ ok: false, error: "base_url and token are required" });
    }
    const normalizedUrl = normalizeBaseUrl(base_url);
    const encrypted = encrypt(token);
    const pool = getPool();
    const result = await pool.query(
      "INSERT INTO personal_tokens (base_url, token_encrypted, label) VALUES ($1, $2, $3) RETURNING id, base_url, label, created_at",
      [normalizedUrl, encrypted, label || ""]
    );
    return { ok: true, data: result.rows[0] };
  });

  // Delete personal token
  app.delete<{
    Params: { id: string };
  }>("/api/v1/personal-tokens/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();
    const result = await pool.query("DELETE FROM personal_tokens WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Token not found" });
    }
    return { ok: true, data: { deleted: true } };
  });

  // Scan projects using personal token
  app.post<{
    Params: { id: string };
  }>("/api/v1/personal-tokens/:id/scan", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();

    const tokenResult = await pool.query("SELECT id, token_encrypted, base_url FROM personal_tokens WHERE id = $1", [id]);
    if (tokenResult.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Token not found" });
    }

    const pt = tokenResult.rows[0];
    const token = decrypt(pt.token_encrypted);
    const client = new GitLabClient({ token, baseUrl: pt.base_url });

    try {
      const glProjects = await client.requestPaginated<any>("/projects?membership=true&per_page=100&order_by=id&sort=asc");

      let added = 0;
      let skipped = 0;

      const baseUrlHost = (() => {
        try {
          const u = new URL(pt.base_url);
          return u.hostname;
        } catch {
          return "unknown";
        }
      })();

      for (const glp of glProjects) {
        const path = glp.path_with_namespace;
        const existing = await pool.query(
          "SELECT id FROM projects WHERE path = $1 AND base_url = $2",
          [path, pt.base_url]
        );
        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        const rootGroup = path.split("/")[0] || "unknown";
        const autoTag = `${rootGroup}.${baseUrlHost}`;
        const tags = [autoTag];

        await pool.query(
          `INSERT INTO projects (path, label, token_encrypted, base_url, tags, description)
           VALUES ($1, $2, '', $3, $4, $5)
           ON CONFLICT (path, base_url) DO NOTHING`,
          [path, glp.name || path, pt.base_url, tags, glp.description || ""]
        );
        added++;
      }

      return { ok: true, data: { added, skipped, total: glProjects.length } };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: safeErrorMessage(err) });
    }
  });

  // Remove token from a project
  app.put<{
    Params: { id: string };
  }>("/api/v1/projects/:id/remove-token", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();
    const result = await pool.query(
      "UPDATE projects SET token_encrypted = '' WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Project not found" });
    }
    return { ok: true, data: { cleared: true } };
  });
}
