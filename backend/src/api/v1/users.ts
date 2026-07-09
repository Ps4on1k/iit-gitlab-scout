import type { FastifyInstance } from "fastify";
import { getPool } from "../../db/pool.js";
import { requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { logAuditAction } from "../../utils/audit.js";
import { validate, userSchema } from "../../utils/validation.js";
import bcrypt from "bcryptjs";

export async function userManagementRoutes(app: FastifyInstance) {
  app.get("/api/v1/users", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query(
      "SELECT id, username, role, is_active, allowed_tags, created_at FROM app_users ORDER BY created_at"
    );
    return { ok: true, data: result.rows };
  });

  app.post<{
    Body: { username: string; password: string; role?: string; allowed_tags?: string[] };
  }>("/api/v1/users", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { username, password, role, allowed_tags } = request.body;

    const v = validate(userSchema, request.body);
    if (!v.success) return reply.status(400).send({ ok: false, error: v.error });
    if (!["admin", "user", "manager"].includes(role || "user")) {
      return reply.status(400).send({ ok: false, error: "role must be 'admin', 'user' or 'manager'" });
    }

    const pool = getPool();
    const hash = await bcrypt.hash(password, 10);
    try {
      const result = await pool.query(
        `INSERT INTO app_users (username, password_hash, role, allowed_tags)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, role, is_active, allowed_tags, created_at`,
        [username, hash, role || "user", allowed_tags || []]
      );
      const admin = (request as any).user as JwtPayload;
      logAuditAction(admin.userId, "user_create", `Created user: ${username} (${role || "user"})`);
      return { ok: true, data: result.rows[0] };
    } catch (err: any) {
      if (err.code === "23505") {
        return reply.status(409).send({ ok: false, error: "Username already exists" });
      }
      throw err;
    }
  });

  app.put<{
    Params: { id: string };
    Body: { role?: string; is_active?: boolean; allowed_tags?: string[] };
  }>("/api/v1/users/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { role, is_active, allowed_tags } = request.body;

    const pool = getPool();
    const existing = await pool.query("SELECT id FROM app_users WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "User not found" });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (role !== undefined) {
      if (!["admin", "user", "manager"].includes(role)) {
        return reply.status(400).send({ ok: false, error: "role must be 'admin', 'user' or 'manager'" });
      }
      updates.push(`role = $${idx++}`);
      values.push(role);
      updates.push(`token_version = token_version + 1`);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(is_active);
      updates.push(`token_version = token_version + 1`);
    }
    if (allowed_tags !== undefined) {
      updates.push(`allowed_tags = $${idx++}`);
      values.push(allowed_tags);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ ok: false, error: "Nothing to update" });
    }

    const auditFields = updates.map((u, i) => {
      const field = u.replace(/ = \$\d+/, "");
      const val = values[i];
      return `${field}=${typeof val === "object" ? JSON.stringify(val) : String(val).slice(0, 100)}`;
    });

    values.push(id);
    const result = await pool.query(
      `UPDATE app_users SET ${updates.join(", ")} WHERE id = $${idx}
       RETURNING id, username, role, is_active, allowed_tags, created_at`,
      values
    );
    const admin = (request as any).user as JwtPayload;
    logAuditAction(admin.userId, "user_update", `Updated user ${id}: ${auditFields.join("; ")}`);
    return { ok: true, data: result.rows[0] };
  });

  app.put<{
    Params: { id: string };
    Body: { password: string };
  }>("/api/v1/users/:id/password", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { password } = request.body;

    if (!password || password.length < 8) {
      return reply.status(400).send({ ok: false, error: "Password must be at least 8 characters" });
    }

    const pool = getPool();
    const existing = await pool.query("SELECT id FROM app_users WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "User not found" });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query("UPDATE app_users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2", [hash, id]);
    const admin = (request as any).user as JwtPayload;
    logAuditAction(admin.userId, "user_password_change", `Changed password for user ${id}`);
    return { ok: true, data: { message: "Password updated" } };
  });

  app.delete<{
    Params: { id: string };
  }>("/api/v1/users/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const admin = (request as any).user as JwtPayload;
    if (Number(id) === admin.userId) {
      return reply.status(400).send({ ok: false, error: "Cannot delete your own account" });
    }
    const pool = getPool();
    const result = await pool.query("DELETE FROM app_users WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "User not found" });
    }
    logAuditAction(admin.userId, "user_delete", `Deleted user ${id}`);
    return { ok: true, data: { deleted: true } };
  });
}
