import type { FastifyInstance } from "fastify";
import { getPool } from "../../db/pool.js";
import { verifyPassword, hashPassword } from "../../utils/password.js";
import { signToken, requireAuth } from "../../utils/auth.js";
import type { JwtPayload } from "../../utils/auth.js";

async function seedDefaultUsers() {
  const pool = getPool();
  const result = await pool.query("SELECT COUNT(*) as cnt FROM app_users");
  if (Number(result.rows[0].cnt) === 0) {
    const adminHash = await hashPassword("admin");
    const userHash = await hashPassword("user");
    await pool.query(
      "INSERT INTO app_users (username, password_hash, role) VALUES ($1, $2, 'admin'), ($3, $4, 'user')",
      ["admin", adminHash, "user", userHash]
    );
  }
}

export async function authRoutes(app: FastifyInstance) {
  await seedDefaultUsers();

  app.post<{
    Body: { username: string; password: string };
  }>("/api/v1/auth/login", async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.status(400).send({ ok: false, error: "username and password required" });
    }

    const pool = getPool();
    const result = await pool.query(
      "SELECT id, username, password_hash, role, is_active FROM app_users WHERE username = $1",
      [username]
    );

    const user = result.rows[0];
    if (!user) {
      return reply.status(401).send({ ok: false, error: "Invalid credentials" });
    }

    if (!user.is_active) {
      return reply.status(403).send({ ok: false, error: "Account is blocked" });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ ok: false, error: "Invalid credentials" });
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return {
      ok: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
    };
  });

  app.get("/api/v1/auth/me", { preHandler: [requireAuth] }, async (request) => {
    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const result = await pool.query("SELECT allowed_tags FROM app_users WHERE id = $1", [user.userId]);
    const allowed_tags = result.rows[0]?.allowed_tags || [];
    return { ok: true, data: { id: user.userId, username: user.username, role: user.role, allowed_tags } };
  });
}
