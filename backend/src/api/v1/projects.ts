import type { FastifyInstance } from "fastify";
import { getPool } from "../../db/pool.js";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { logAuditAction } from "../../utils/audit.js";
import { resolveBaseUrl, validateBaseUrl } from "../../utils/project-token.js";
import { getCached, setCache, clearCache } from "../../utils/cache.js";
import { validate, projectSchema } from "../../utils/validation.js";
import { getActiveJobs, isAnyCollectionRunning } from "../../utils/collect-tracker.js";
import yamlLib from "js-yaml";
import { safeErrorMessage } from "../../utils/safe-error.js";

export async function projectsRoutes(app: FastifyInstance) {
  app.get("/api/v1/projects", { preHandler: [requireAuth] }, async () => {
    const cached = getCached<any>("projects:list");
    if (cached) return cached;

    const pool = getPool();
    const result = await pool.query(
      "SELECT id, path, label, tags, base_url, description, created_at, updated_at FROM projects ORDER BY created_at DESC"
    );
    const response = { ok: true, data: result.rows };
    setCache("projects:list", response, 60_000);
    return response;
  });

  app.post<{
    Body: { path: string; label: string; token: string; base_url?: string; tags?: string[]; description?: string };
  }>("/api/v1/projects", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { path, label, token, base_url, tags, description } = request.body;

    const v = validate(projectSchema, request.body);
    if (!v.success) return reply.status(400).send({ ok: false, error: v.error });

    const urlToValidate = base_url || "https://gitlab.com/api/v4";
    const urlCheck = validateBaseUrl(urlToValidate);
    if (!urlCheck.valid) {
      return reply.status(400).send({ ok: false, error: urlCheck.error });
    }

    const encrypted = token ? encrypt(token) : null;
    const pool = getPool();

    try {
      const normalizedBase = resolveBaseUrl(base_url || "https://gitlab.com/api/v4");
      const result = await pool.query(
        `INSERT INTO projects (path, label, token_encrypted, base_url, tags, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, path, label, tags, base_url, description, created_at`,
        [path, label, encrypted, normalizedBase, tags || [], description || ""]
      );
      const user = (request as any).user as JwtPayload;
      logAuditAction(user.userId, "project_create", `Created project: ${label} (${path})`);
      clearCache("projects");
      return { ok: true, data: result.rows[0] };
    } catch (err: any) {
      if (err.code === "23505") {
        return reply.status(409).send({ ok: false, error: "Проект с таким path уже существует в этом GitLab инстансе" });
      }
      throw err;
    }
  });

  app.put<{
    Params: { id: string };
    Body: { path?: string; label?: string; token?: string; base_url?: string; tags?: string[]; description?: string };
  }>("/api/v1/projects/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { path, label, token, base_url, tags, description } = request.body;

    if (base_url !== undefined) {
      const urlCheck = validateBaseUrl(base_url);
      if (!urlCheck.valid) {
        return reply.status(400).send({ ok: false, error: urlCheck.error });
      }
    }

    const pool = getPool();
    const existing = await pool.query("SELECT id FROM projects WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Project not found" });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (path !== undefined) { updates.push(`path = $${idx++}`); values.push(path); }
    if (label !== undefined) { updates.push(`label = $${idx++}`); values.push(label); }
    if (token !== undefined && token.trim().length > 0) { updates.push(`token_encrypted = $${idx++}`); values.push(encrypt(token)); }
    if (base_url !== undefined) { updates.push(`base_url = $${idx++}`); values.push(resolveBaseUrl(base_url)); }
    if (tags !== undefined) { updates.push(`tags = $${idx++}`); values.push(tags); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }

    if (updates.length === 0) {
      return reply.status(400).send({ ok: false, error: "Nothing to update" });
    }

    const auditFields = updates.map((u, i) => {
      const field = u.replace(/ = \$\d+/, "");
      const val = values[i];
      return `${field}=${typeof val === "object" ? JSON.stringify(val) : String(val).slice(0, 100)}`;
    });

    updates.push(`updated_at = now()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE projects SET ${updates.join(", ")} WHERE id = $${idx}
       RETURNING id, path, label, tags, base_url, description, created_at, updated_at`,
      values
    );
    const user = (request as any).user as JwtPayload;
    logAuditAction(user.userId, "project_update", `Updated project ${id}: ${auditFields.join("; ")}`);
    clearCache("projects");
    return { ok: true, data: result.rows[0] };
  });

  app.delete<{
    Params: { id: string };
  }>("/api/v1/projects/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;

    if (isAnyCollectionRunning()) {
      return reply.status(409).send({ ok: false, error: "Невозможно удалить: идёт сбор данных. Дождитесь завершения." });
    }

    const pool = getPool();
    const result = await pool.query("DELETE FROM projects WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Project not found" });
    }
    const user = (request as any).user as JwtPayload;
    logAuditAction(user.userId, "project_delete", `Deleted project ${id}`);
    clearCache("projects");
    return { ok: true, data: { deleted: true } };
  });

  app.delete("/api/v1/projects/all", { preHandler: [requireAdmin] }, async (request, reply) => {
    if (isAnyCollectionRunning()) {
      return reply.status(409).send({ ok: false, error: "Невозможно удалить: идёт сбор данных. Дождитесь завершения." });
    }

    const pool = getPool();
    const countResult = await pool.query("SELECT COUNT(*)::int AS count FROM projects");
    const count = countResult.rows[0].count;
    if (count === 0) {
      return { ok: true, data: { deleted: 0 } };
    }
    await pool.query("DELETE FROM commits");
    await pool.query("DELETE FROM contributor_profiles");
    await pool.query("DELETE FROM project_activity");
    await pool.query("DELETE FROM project_branches");
    await pool.query("DELETE FROM project_results");
    await pool.query("DELETE FROM project_pipelines");
    await pool.query("DELETE FROM project_merge_requests");
    await pool.query("DELETE FROM project_issues");
    await pool.query("DELETE FROM project_packages");
    await pool.query("DELETE FROM project_dependencies_audit");
    await pool.query("DELETE FROM project_languages");
    await pool.query("DELETE FROM project_deployments");
    await pool.query("DELETE FROM analysis_runs");
    await pool.query("DELETE FROM scheduler_errors");
    await pool.query("DELETE FROM projects");
    const user = (request as any).user as JwtPayload;
    logAuditAction(user.userId, "project_delete", `Deleted ALL projects (${count} total)`);
    clearCache("projects");
    return { ok: true, data: { deleted: count } };
  });

  app.get("/api/v1/projects/export", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query("SELECT path, label, tags, base_url, description FROM projects ORDER BY label");
    const data = {
      projects: result.rows.map((r: any) => ({
        path: r.path,
        label: r.label,
        token: "",
        tags: r.tags || [],
        base_url: r.base_url || "",
        description: r.description || "",
      })),
    };
    const yaml = yamlLib.dump(data, { lineWidth: -1 });
    return { ok: true, data: { yaml } };
  });

  app.get<{
    Params: { id: string };
  }>("/api/v1/projects/:id/token", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();
    const result = await pool.query("SELECT token_encrypted FROM projects WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Project not found" });
    }
    const decrypted = decrypt(result.rows[0].token_encrypted);
    return { ok: true, data: { token: decrypted } };
  });

  app.post<{
    Body: { yaml: string };
  }>("/api/v1/projects/import-yaml", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { yaml } = request.body;
    if (!yaml) {
      return reply.status(400).send({ ok: false, error: "yaml is required" });
    }

    try {
      const parsed = yamlLib.load(yaml) as any;
      const projects = parsed.projects || parsed;
      if (!Array.isArray(projects)) {
        return reply.status(400).send({ ok: false, error: "Invalid YAML: expected array of projects" });
      }

      const pool = getPool();
      const imported: { path: string; label: string }[] = [];
      const errors: { path: string; error: string }[] = [];

      for (const proj of projects) {
        if (!proj.path || !proj.label) {
          errors.push({ path: proj.path || "unknown", error: "Missing path or label" });
          continue;
        }
        const urlToValidate = proj.base_url || "https://gitlab.com/api/v4";
        const urlCheck = validateBaseUrl(urlToValidate);
        if (!urlCheck.valid) {
          errors.push({ path: proj.path, error: urlCheck.error || "Invalid URL" });
          continue;
        }
        try {
          const encrypted = proj.token ? encrypt(proj.token) : null;
          await pool.query(
            `INSERT INTO projects (path, label, token_encrypted, base_url, tags, description)
             VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (path, base_url) DO UPDATE SET
                label = EXCLUDED.label, token_encrypted = EXCLUDED.token_encrypted,
                tags = EXCLUDED.tags,
                description = EXCLUDED.description, updated_at = now()`,
            [proj.path, proj.label, encrypted, proj.base_url || "https://gitlab.com/api/v4", proj.tags || [], proj.description || ""]
          );
          imported.push({ path: proj.path, label: proj.label });
        } catch (err) {
          errors.push({ path: proj.path, error: safeErrorMessage(err) });
        }
      }

      return { ok: true, data: { imported, errors, total: projects.length } };
    } catch (err) {
      return reply.status(400).send({ ok: false, error: "Invalid YAML format" });
    }
  });
}
