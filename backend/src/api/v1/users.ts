import type { FastifyInstance } from "fastify";
import { getPool } from "../../db/pool.js";
import { requireAdmin } from "../../utils/auth.js";
import bcrypt from "bcryptjs";

export async function userManagementRoutes(app: FastifyInstance) {
  // List all users
  app.get("/api/v1/users", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query(
      "SELECT id, username, role, is_active, created_at FROM app_users ORDER BY created_at"
    );
    return { ok: true, data: result.rows };
  });

  // Create user
  app.post<{
    Body: { username: string; password: string; role?: string };
  }>("/api/v1/users", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { username, password, role } = request.body;
    if (!username || !password) {
      return reply.status(400).send({ ok: false, error: "username and password are required" });
    }
    if (!["admin", "user"].includes(role || "user")) {
      return reply.status(400).send({ ok: false, error: "role must be 'admin' or 'user'" });
    }

    const pool = getPool();
    const hash = await bcrypt.hash(password, 10);
    try {
      const result = await pool.query(
        `INSERT INTO app_users (username, password_hash, role)
         VALUES ($1, $2, $3)
         RETURNING id, username, role, is_active, created_at`,
        [username, hash, role || "user"]
      );
      return { ok: true, data: result.rows[0] };
    } catch (err: any) {
      if (err.code === "23505") {
        return reply.status(409).send({ ok: false, error: "Username already exists" });
      }
      throw err;
    }
  });

  // Update user (role, active status)
  app.put<{
    Params: { id: string };
    Body: { role?: string; is_active?: boolean };
  }>("/api/v1/users/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { role, is_active } = request.body;

    const pool = getPool();
    const existing = await pool.query("SELECT id FROM app_users WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "User not found" });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (role !== undefined) {
      if (!["admin", "user"].includes(role)) {
        return reply.status(400).send({ ok: false, error: "role must be 'admin' or 'user'" });
      }
      updates.push(`role = $${idx++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ ok: false, error: "Nothing to update" });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE app_users SET ${updates.join(", ")} WHERE id = $${idx}
       RETURNING id, username, role, is_active, created_at`,
      values
    );

    return { ok: true, data: result.rows[0] };
  });

  // Change password
  app.put<{
    Params: { id: string };
    Body: { password: string };
  }>("/api/v1/users/:id/password", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { password } = request.body;

    if (!password || password.length < 4) {
      return reply.status(400).send({ ok: false, error: "Password must be at least 4 characters" });
    }

    const pool = getPool();
    const existing = await pool.query("SELECT id FROM app_users WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "User not found" });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query("UPDATE app_users SET password_hash = $1 WHERE id = $2", [hash, id]);
    return { ok: true, data: { message: "Password updated" } };
  });

  // Delete user
  app.delete<{
    Params: { id: string };
  }>("/api/v1/users/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();
    const result = await pool.query("DELETE FROM app_users WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "User not found" });
    }
    return { ok: true, data: { deleted: true } };
  });
}
